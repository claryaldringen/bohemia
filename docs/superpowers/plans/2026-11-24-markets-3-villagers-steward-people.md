# Obchod 3 – vesničané a správce na trhu, zakázky, lidé a sňatky se sousedy – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vesničané a správce jezdí sami na trh do skutečných sousedních vsí (nástroje, keramika, dřevěné nářadí, vozy, osivo, hřivny na kování vozu, obilí v nouzi), řemeslník bere zakázky od kohokoli a za výrobky vždy obilí, kovář souseda přijde okovat koně a lidé se stěhují a berou mezi skutečnými vsemi – přes poštu z plánu 2, aniž by kdo vznikl nebo zmizel (issue #11, plán 3 ze 6).

**Architecture:**

- **Okolí vsi** (`VillageState.nearby`): vsi na 8 sousedních mapách a ves sama (id a jméno pro klíč výpravy), u každé svobodní, kteří by šli za partnerem odjinud (Úloha 9). Zapíše ho událost schránky `nearby` v pevné dny kalendáře – před dopočtem přes ně ji do schránky dá sám dopočet vsi (`updateVillage` přes `villages.nearby`). **Bez okolí se nic z plánu 3 nespustí** – Vlkov i zlaté otisky simulují beze změny.
- **Každé zboží a každý člověk jde mezi vsemi výpravou na trh z plánu 2** (`departMarket`, `market-arrive`, `market-result`, odchozí schránka, `deliverVillageMail`, zaniklý hostitel, výprava po termínu). Nový je jen náklad výpravy (lidé `MarketPerson`, nevěsta či ženich `MarketArrival.kin`, kování `MarketArrival.service`), tři zprávy bez nákladu – dotaz na partnera `kin-ask`, dotaz na kováře `smith-ask`, hotová zakázka `order-ready` – a zpráva `stranded-people` (do Opravného kola 1 úlohy 10 `people-back`), která vrátí lidi z výsledku pro zaniklou domovskou ves hostiteli (Úloha 10).
- Rozhodnutí vesničanů, správce, sňatků a kování jsou **kroky dne simulace** – jen ze stavu vsi a událostí schránky dne, náhoda z vlastních proudů (`'kin:' + den`). Dopočet po kouscích dá týž výsledek.
- **Zakázky** drží hostitel (`market.orders`), kupující si pamatuje své (`VillageState.orders`). Řemeslník vyrábí do vlastní potřeby a otevřených zakázek, za výrobky bere obilí a luštěniny vždy (Martin 24. 11. 2026); hotovou zakázku ohlásí zprávou a kupující si pro ni dojede.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/server`, `apps/web` (Next.js 16, React 19), Playwright (projekty chromium a worker).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Martinova rozhodnutí (i Spodní a Horní cena z 23. 11.), Pravidla 2, 3, 8 a 9, Rozhodnutí plánu 1 (body 1, 6, 8) a plánu 2 (celé), Nechává se na stavitele.
- `docs/design/neighbours.md` – Martinova rozhodnutí (Sňatky, Řemeslníci souseda, Sousedé i vsi jiných hráčů), Pravidla 1 (kdo je soused) a 6–8 jako podklad.
- Plán 1 `docs/superpowers/plans/2026-11-23-markets-1-real-neighbours.md` – Rozhodnutí 1 (tabulka „Vrátí se – 3“), 6 (další manželky). Plán 2 `docs/superpowers/plans/2026-11-23-markets-2-market-without-coins.md` a jeho kód.
- Martin k řemeslům a koním: wagons.md – Kování vozů (20. 10. 2026: „Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má) dojít do nejbližší vesnice, kde kovář je“), horses.md – Kování (26. 10. 2026: „To obstará ideálně kovář ve vsi, případně kovář z jiné vsi, ale bude to násobně dražší, protože musí přijít.“; 27. 10.: „každý kovář musí fyzicky dojít do té ohrady“; 14. 11.: „Kovář z Lhoty okul koně“), lord.md – Manželky a `history/lord-history.md` – Další manželky mužů rodu z okolí, kinship.md – Sňatky (Martin 19. 10. 2026: „hlavně k vdově nebo dceři z domu bez mužů“).
- Mapa kódu: `docs/code/village-trade.md` (Trh – ceny a zápočet, co ves nabízí a shání, Trh ve vsi, Výprava na trh, Pošta mezi vsemi, Lidé – koho ves dá), `village-crafts.md` (Nákup u sousedů, Kování vozů, Kovář), `village-people.md` (Manželky, Sňatky), `village-livestock.md` (kování koní), `village-steward.md`, `world.md` (Schránka vsi), `worker.md` (Pošta mezi vsemi).
- Kód smazaný plánem 1 je k nahlédnutí v `b4f8dadc` (`git show b4f8dadc:<cesta>`, složka `packages/game/src/domain/village/`):
  - `crafts/craft-buying.ts` (`planPurchases`, `yearlySaving`, `withToolCoverage`, `pay`), `crafts/purchase-carts.ts` (`cartValueKg`), `fields/seed-buying.ts` (`buySeed`),
  - `steward/steward-needs.ts` (`grainStep`, `grainDeal`, `grainDealWith`, `grainPayment`, `constructionLogsLeft`, `FIT_TRIES`),
  - `people/marriage.ts` (`outsideMarriages`, `favouredBride`, `crowded`, `perDay`), `people/dynasty-wives.ts` (`extraWivesDay`, `extraWifeHome`, `wifeCounts`),
  - `livestock/horse-shoeing.ts` (cizí kovář, `shoeingCosts`),
  - `rules/rules-*.ts` (`CRAFT_BUYING`, `SEED_BUYING.maxCows`, `MARRIAGE.outside*`, `MARRIAGE.brideAge`, `LORD.maxWives`, `LORD.extraWifePerYear`, `extraWifeFromAge`, `extraWifeAge`).

## Global Constraints

- **Předpoklad:** plán 2 je sloučený ve `feat/landscape`. Musí platit (`grep -rnw <jméno> packages apps`): `departMarket`, `joinMarket`, `marketDay`, `marketResult`, `applyMarketResult`, `marketStance`, `marketFreeAdults`, `deliverVillageMail`, `VillageMail`, `VillageState.outbox`, `VillageState.news`, `marketOverview`; neexistuje `outsideMarriages`, `startPurchases`, `buySeed`, `grainStep`, `favouredBride`, `extraWivesDay`, `MARRIAGE.outside`. Jinak Úlohu 1 nezačínat a ozvat se. Práce běží ve větvi `feat/markets-3` z `feat/landscape`.
- **Martin, 22. 11. 2026:**
  - Vesničané na trh pro nástroje, keramiku a osivo: „Ano“; „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“.
  - „se sousedy je na náhodě, ze které dostupně vsi ženich nebo nevěsta bude“; „Řemeslníkovi je jedno, kdo mu platí za výrobky“.
  - Zápočet bez mincí („ANo, přesně tak“), hostitel podle výpočtu potřeby („ano“), výprava jen se seznamem za cenu dne („ok“). Platí dál beze změny.
- **Martin 23. a 24. 11. 2026** – nevěsty a platba řemeslníkovi: oddíl Martinova rozhodnutí k plánu 3.
- **Mimo plán 3:** kupci a mince (plán 4), otroci (plán 5), zlato, šperkař a mincovna (plán 6). Trh zůstává řídký – hostitel prodá jen za to, co shání (plán 2, Rozhodnutí 4); jediná výjimka je obilí a luštěniny za výrobky dílen (Martin 24. 11. 2026, Rozhodnutí 5).
- **Žádná pravidla navíc:** žádné cenové meze, minimální zásoby, nové suroviny ani pohodlné rozkazy. Nová čísla jsou jen ta, která plán jmenuje v Rozhodnutích, každé s odkazem. Technické meze mají v kódu poznámku „technická mez, ne pravidlo“ s důvodem jako `MAIL_ATTEMPTS`: obnova okolí (`NEARBY_REFRESH_DAYS`, use-case), úklid použitých snímků okolí (`NEARBY_KEEP_DAYS`, use-case – Rozhodnutí 1), vypršení zakázky (`MARKET.orderDays`, vedle `MARKET.report.traders`) a počet pokusů správce (`FIT_TRIES`).
- **Nikdo nevznikne ani nezmizí:** člověk je vždy právě na jednom místě – v `people` vsi, v nákladu výpravy (odchozí schránka, schránka cíle, `market.visitors`) nebo ve výsledku na cestě domů. Odchod zapíše `removePeople` (do `emigrants`), příchod `rehomePeople` (nová místní id – `nextId` vsi vzroste o počet příchozích), návrat domů vrátí původní id (`restorePeople`). Žádný nový člověk nevznikne a odchozí zůstane v `emigrants` své vsi. Lidé z výsledku pro zaniklou domovskou ves jdou zpět k hostiteli (`stranded-people`, Úloha 10).
- **Hexagon:** doména a use-casy bez infrastruktury. Web i worker volají stejné use-casy. **Žádná herní logika ve webu** – web jen ukazuje a posílá záměry.
- **Determinismus:** bez `Math.random`, `Date.now()` a `new Date()`. Rozhodnutí dne jen ze stavu vsi a událostí schránky toho dne; náhoda z vlastního proudu (`deriveSeed(state.seed, 'kin:' + day)`), nikdy z proudu jiného kroku.
- **Čísla pravidel** jen v `rules*.ts` s odkazem „markets.md – Rozhodnutí plánu 3, bod N“ (obnovená čísla i s původním odkazem a datem). Do textu návrhů je zapíše Úloha 12.
- **Stav vsi:** nové části jsou volitelné (`nearby`, `orders`, `market.orders`, `shoeing.asked`, `trade.grainMisses`, náklady výpravy, nová pole kroniky). Chybějící = prázdné, převod se nepřidává a `VILLAGE_MIGRATIONS` zůstává beze změny (jako plán 2). Kodek se nemění, DB migrace není.
- **Zlaté otisky se nesmí změnit:** ves bez okolí simuluje bit po bitu stejně. Selže-li `*golden*.test.ts`, je to chyba úlohy.
- **Pasti z plánu 2:**
  - stav po předchozích úlohách ověř `grep -rnw` dřív, než na něj navážeš,
  - testy tvrdí skutečné hodnoty (kg, kusy, id, den), ne jen „něco se stalo“,
  - volné lidi počítá jen `marketFreeAdults`; kdo odchází jako zboží nebo partner, nosičem není,
  - kusové zboží (dobytek, koně, vozy, lidé) jen celé,
  - smyčky přes `TRADE_GOODS`, které volají `addGood` (`departMarketInPlace`, `settleTrades`, `applyMarketResult`), přeskočí koně i lidi – ti mají vlastní cestu,
  - cizí správce nevidí ostatní vsi držitele – ani v kronice, upozorněních a tooltipech (Úloha 11).
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip` a kronice.
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`. Úlohy 2–9 navíc `nice -n 19 npm run test:slow`, Úlohy 1 a 10 `npm run test:db`. E2e jen kde to úloha říká, sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 12.
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 150 kroků na úlohu. DB `bohemia` jen ke čtení.

## Martinova rozhodnutí k plánu 3

1. **Nevěsty:** Claude se Martina 23. 11. 2026 zeptal: „Má si i svobodná žena, která nedrží dům, hledat ženicha v sousední vsi sama, nebo se jen vdá pryč, když se na ni zeptá muž odjinud?“ Martin zvolil možnost „Jen se vdá pryč“. Popis možnosti od Clauda: „Ženicha hledá muž, nevěsta jde k němu jako při svatbě ve vsi. Sama se ptá jen vdova a dcera z domu bez mužů, jak jsi rozhodl 19. 10. 2026.“ – Rozhodnutí plánu 11, Úloha 9.
2. **Platba řemeslníkovi:** Claude se Martina 24. 11. 2026 zeptal: „Má řemeslník (kovář, hrnčíř, tesař) za své výrobky brát obilí vždy, i když ho jeho ves zrovna neshání?“ Martin zvolil možnost „Ano, řemeslník bere obilí vždy“. Popis možnosti od Clauda: „Za své výrobky vezme obilí (a luštěniny) vždy, živí se řemeslem. Vesničané si pak nástroje, keramiku a dřevěné nářadí koupí za obilí jako dřív u smyšlených sousedů, jen u skutečného řemeslníka.“ V plánu:
   - na trhu hostitele obilí a luštěniny vždy „shání“, kdo prodává výrobky dílen – nejvýš za hodnotu výrobků, které ten den prodá; zbytek zápočtu se nemění (Rozhodnutí 5, Úloha 4),
   - totéž platí pro zakázky (Rozhodnutí 6, Úloha 4),
   - test: ves s kovářem, která obilí neshání (nad pojistkou), prodá výpravě vesničanů nástroje za obilí (Úloha 5),
   - Úloha 12 tím ověří, že se pole po plánu 1 vracejí (vybavení nástroji roste).

## Rozhodnutí plánu (návrh Clauda)

1. **Okolí vsi.** Simulace vsi nezná ostatní vsi ani své id, a vesničané se přitom musí rozhodovat uvnitř dne (jinak by výsledek závisel na kouscích dopočtu). Proto:
   - `VillageState.nearby` = `{ day, self: { villageId, name }, villages: NearbyVillage[] }`, `NearbyVillage` = `{ villageId, name, cells, firstStep, singles? }`.
   - Obsah: jen vsi na **8 sousedních mapách** (neighbours.md – Pravidla 1: soused je ves na sousední mapě, i jiného hráče – Martin), žijící, se sídlem, ne přes odříznutí nováčka (`crossesIsolation`). Válka nevadí (plán 2, Rozhodnutí 1). Vzdálenější vsi z přehledu hráče (vsi rodu, znalost mapy, zprávy) do okolí nepatří – vesničané jezdí k sousedům, hráč smí dál. U každé vsi svobodní, kteří by šli za partnerem odjinud, po pohlaví a 5 letech věku (`singles`, Úloha 9) – stejný druh veřejné zprávy jako „na pivu“.
   - Zapisuje ho událost schránky `nearby` (`applyNearby`) **v pevné dny kalendáře** `K ≡ 0 (mod NEARBY_REFRESH_DAYS)`, `NEARBY_REFRESH_DAYS = 30`. **Technická mez, ne pravidlo:** okolí je jeden snímek, který se celý nahradí – stav vsi neroste a sousedé se nečtou každý den; mez určuje jen, jak rychle se ves dozví o nové vsi za kopcem.
   - **Úklid snímků** (Úloha 10, návrh Clauda): po zápisu nového snímku dopočet smaže ze schránky použité snímky se dnem ≤ `afterDay − NEARBY_KEEP_DAYS`, `NEARBY_KEEP_DAYS = 365` (`inbox.pruneNearby`). **Technická mez, ne pravidlo:** smazaný řádek uvolní `ref` `nearby:<ves>:<den>` a dopočet se starším stavem vsi (souběh webu a workeru) by snímek zapsal znovu – rok je daleko za každou dávkou dopočtu; schránka tak drží nejvýš ~12 snímků na ves místo ~12 za každý herní rok. Chyba úklidu jde jen do logu, dopočet nezastaví.
   - **Zápis před dopočtem přes K** (návrh Clauda 24. 11. 2026 po kontrole Úlohy 1 – původně „den `lastDay + 1` po dávce“, takže den snímku určovaly hranice dávek a stav vsi závisel na kouscích dopočtu): `updateVillage` po načtení událostí schránky dopočítávaných dnů zavolá volitelný podport úložiště `villages.nearby` (`NearbyRefresh`, jako bariéra `holds`; úložiště v DB ho má vždy, testy ho zapnou `withNearby`, kalibrace a zlaté otisky bez něj). Ten na každé K v `(lastDay, den dopočtu]`, na které událost `nearby` ve schránce ještě není, zapíše snímek s `ref` = `nearby:<ves>:<K>`; když se něco zapsalo, pokus se zopakuje nad čerstvou schránkou. Čekající událost je čerstvé okolí. Den snímku tak nezávisí na dávkách workeru, chvíli pohledu ani na tom, kdo ves přes K dopočítá; obsah je stav ostatních vsí v okamžiku zápisu – mezivesnická výjimka jako pošta (worker.md – Výjimky a omezení).
   - **Sken bez načtení stavů** (`nearbyVillages(deps, home)` – záznam domovské vsi parametrem): sídla na prstenci 1 (`holderAt`, `listActive`) a otisky vsí (`stampsOf` – jméno, spí-li). Odříznutá nebo archivovaná ves sama dostane prázdný snímek (a dál se nezkouší), spící nic. Co snímek potřebuje navíc (`singles`, Úloha 9), vezme jen ze stávajícího jsonb souhrnu vsi – bez DB migrace. `nearbyStale`, `refreshNearby` a `refreshNearbySafely` nejsou – kde je zmiňují Úlohy 9–10, myslí se zápis v pevné dny (v testech `villages.withNearby`).
   - Srovnání: cesta přes `news` by vesničanům nedala žádný cíl, dokud hráč nepošle výpravu; rozhodnutí mimo simulaci (use-case po dopočtu) by porušilo determinismus.
2. **Co ves ví o řemeslech sousedů:** jen ze zpráv na pivo (`news`, plán 2 – Rozhodnutí 7), stejně jako hráč. Zprávu přinese každá výprava – i výprava vesničanů, správce, nevěsty či kováře. Dotazy `kin-ask` a `smith-ask` nesou zprávu o vsi, která se ptá (posel „zašel na pivo“). Ves bez zprávy o řemeslníkovi k němu nejede – osivo, obilí a sňatky zprávu nepotřebují, takže se vsi časem poznají samy.
3. **Všechno jede výpravou na trh** (plán 2, Rozhodnutí 1 – karavana a schránka vsi). Výsledek každé výpravy se vrátí domovské vsi, takže zaniklý hostitel a výprava po termínu mají hotové řešení z plánu 2, i pro lidi:

   | Co                              | Kdo posílá                               | Náklad výpravy                         | U hostitele                               |
   | ------------------------------- | ---------------------------------------- | -------------------------------------- | ----------------------------------------- |
   | výrobky, vozy, osivo, hřivny    | vesničané (bod 7)                        | platba `give`, seznam `wants`          | zápočet (plán 2)                          |
   | obilí v nouzi, potřeba vsi      | správce (bod 8)                          | `give` / `wants` z výpočtu potřeby     | zápočet                                   |
   | kování koní                     | ves kováře na dotaz `smith-ask` (bod 9)  | hřivny kováře, `service`               | kování, poplatek v `bought`, mimo zápočet |
   | lidé (výměna, noví osadníci)    | hráč, správce (bod 10)                   | lidé `MarketPerson` jako zboží         | zápočet, prodaní se usadí                 |
   | nevěsta, ženich, další manželka | ves partnera na dotaz `kin-ask` (bod 11) | partner bez dětí `MarketPerson`, `kin` | svatba hned po příjezdu, mimo zápočet     |

   Doprovod je aspoň 1 nosič (`marketCrew`), kovář jde sám (bod 9). Kdo odchází jako zboží nebo partner, nosičem není. Dotaz a ohlášení zakázky jsou zprávy bez nákladu, cestu posla nikdo neplatí prací (jako odeslání pošty v plánu 2).

4. **Výrobky dílen a lidé jako zboží trhu.** „Jen společné suroviny“ (Martin 19. 10. 2026) platí – každá ves je má. Hodnoty v kg obilí (`TRADE_GOOD_VALUES`, `{ valueKg, carryKg }`), cena v mincích z nich kurzem `MARKET.grainKgPerCoin` jako u ostatního zboží:

   | Zboží                                       | Jednotka | Hodnota  | Nese se (`carryKg`) | Odkud číslo                                                         |
   | ------------------------------------------- | -------- | -------- | ------------------- | ------------------------------------------------------------------- |
   | `tools` – nástroje (do vybavení domácností) | kg       | 60       | 1                   | dřív `CRAFT_BUYING.toolsValueKg` (rešerše 2026-10-18)               |
   | `woodTools` – dřevěné nářadí                | kg       | 2        | 1                   | dřív `CRAFT_BUYING.woodToolsValueKg`                                |
   | `twoWheelCarts`, `fourWheelCarts` – vozy    | kus      | 320, 640 | 0 (táhnou voli)     | dřív `cartValueKg` (práce tesaře, klády, kování)                    |
   | `men`, `women` – svobodný dospělý           | kus      | 360      | 0 (jdou po svých)   | dřív výměna lidí („dospělý 360 kg obilí“)                           |
   | `families` – rodina                         | kus      | 720      | 0 (jdou po svých)   | dva dospělí, děti v ceně (návrh Clauda – trh zná jednu cenu za kus) |

   Keramika, hřivny a uhlí už zbožím jsou. Kusové jsou vozy a lidé (`PIECE_GOODS`). Rodina stojí stejně se 3 i s 8 lidmi – Úloha 12 to zapíše do návrhu. Koupený vůz táhnou domů voli, kteří s výpravou jdou – kolik jich je třeba, spočítá z vozů v seznamu `checkMarketTrip` (`MarketTrip.oxen`; dřív „koupený vůz voli dovedou domů“). Prodá se nejmladší volný vůz druhu: kupující dostane vůz nový (`addCart`), vůz na trhu stáří nenese.

5. **Co hostitel nabízí a shání** (plán 2, Rozhodnutí 5 – rozšíření o výrobky a lidi):

   | Zboží                      | Nabízí                                              | Shání (jen bez vlastního pracujícího řemeslníka)               |
   | -------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
   | `tools`                    | vybavení nad `toolNeedKg`                           | `toolNeedKg − vybavení`                                        |
   | `pottery`, `woodTools`     | zásoba nad `craftTargets`                           | `craftTargets − zásoba`                                        |
   | `ironBars`                 | zásoba nad `smithBarsTargetKg`                      | hřivny na vozy čekající na kování (`ironOrderBarsKg − zásoba`) |
   | vozy                       | volné vozy nad vozy, které ves chce (`cartsWanted`) | `missingCart` → 1 vůz toho druhu                               |
   | `men`, `women`, `families` | `peopleSpare` (dávky – výhled přebytku lidí)        | `peopleWanted` – obráceně: půdy víc než práce (bod 10)         |
   - **Řemeslník bere obilí vždy** (Martin 24. 11. 2026): hostitel s pracujícím řemeslníkem, jehož výrobky (`ORDER_GOODS`) výpravy ten den shánějí, shání navíc obilí, pak luštěniny – nejvýš za hodnotu těch výrobků, kterou ten den prodá (`craftPayWants`, Úloha 4). Zbytek zápočtu se nemění; zápočet je vyrovnaný, takže hostitel obilí nekoupí víc, než kolik utrží.
   - Jídlo (maso, sýr, luštěniny) se do nabídky hostitele nepřidává – pravidlo 9 ho nejmenuje a výpočet potřeby jako u dávek pro něj není; plán 2 ho sliboval, je to odvolané (návrh Clauda).

6. **Zakázky** („Řemeslníkovi je jedno, kdo mu platí za výrobky“). Bez mincí nejde platit předem – zápočet nezná dluh (plán 2, Rozhodnutí 4). Proto:
   - Když výprava odjíždí s nekoupeným výrobkem dílny (`ORDER_GOODS`: nástroje, keramika, dřevěné nářadí, hřivny, vozy) a hostitel má pracujícího řemeslníka toho řemesla a výprava ještě veze obilí nebo luštěniny (řemeslník je bere vždy – Martin 24. 11. 2026) nebo něco, co hostitel shání, hostitel zapíše zakázku `CraftOrder` (ves, zboží, množství, den). Novější zakázka téže vsi na totéž zboží tu starou nahradí.
   - **Odchylka od neighbours.md – Pravidla 6** („zakázka přijde schránkou … platí obilím jako dnes“): zakázka se zapíše při odjezdu výpravy a platí se až při vyzvednutí, protože zápočet bez mincí nezná dluh ani platbu předem. Úloha 12 ji zapíše do neighbours.md i s tímto důvodem.
   - Řemeslník vyrábí do vlastní potřeby **plus otevřené zakázky** (`orderTargets`). Hotové kusy jsou na prodej komukoli – kdo dřív zaplatí, ten má.
   - Jakmile zásoba nad vlastní potřebou pokryje zakázku, hostitel pošle `order-ready` (jednou – `readyDay`). Prodej kupujícímu zakázku zmenší. Zakázka vyprší po `MARKET.orderDays = 365` dnech – **technická mez, ne pravidlo:** zakázka, kterou nikdo nevyzvedne (kupující zanikl, přestal ji chtít), nesmí ve stavu hostitele zůstat navždy (stav vsi nesmí růst donekonečna); rok, protože vesničané jezdí jednou ročně.
   - Kupující si pamatuje své zakázky (`VillageState.orders`: `open`, `ready`, `refused`) z výsledku výpravy (`MarketResult.ordered`). Pro výrobek s otevřenou zakázkou nejede, u vsi, která zakázku nevzala (`refused`), ho rok nehledá. Zpráva `order-ready` přijde ráno dne D (schránka): zakázka je `ready` a vesničané výpravu odešlou týž den (krok dne), vyrazí ráno D + 1 (`departDay` jako každá výprava).
7. **Vesničané na trhu** (pravidlo 9: „když se jim to vyplatí“ – dnešní rozhodování nákupu u sousedů). Krok dne `villagerTripsDay`, jen s okolím, jedna výprava na cíl a den:
   - **15. 11.** (`CRAFT_BUYING.day`, dřívější den nákupu): nástroje, keramika, dřevěné nářadí a vůz – port `planPurchases` z `b4f8dadc`. Cíl je nejbližší ves okolí, o jejímž řemeslníkovi ves ví ze zprávy (`nearestWith(state, ORDER_CRAFT[g])`). Cena je cena trhu ze zprávy (jinak výchozí) × `MARKET.grainKgPerCoin`. Platí se z `paymentPool` obilím a luštěninami – řemeslník je bere vždy, cíl je shánět nemusí. Náklad je práce platby a nosičů (nosiči × dny pryč). Koupí se jen to, co ušetří víc práce, než stojí.
   - **1. 9. a 1. 3.** (`SEED_RESERVE.days`, dřívější `SEED_BUYING.days`): osivo, které chybí (`seedShortKg` ≥ `SEED_RESERVE.minKg` 5 kg), v nejbližší vsi okolí. Platí se hřivnami a krávami nad ty, které ves drží, nejvýš `SEED_RESERVE.maxCows` = 1 (obnovené `SEED_BUYING.maxCows`, dřívější `buySeed`). Osivo se kupuje jen dvakrát ročně, prázdný návrat se tak nejvýš dvakrát do roka opakuje – paměť odmítnutí proto není.
   - **Kdykoli:** vůz čeká na kování a ves nemá pracujícího kováře → tesař jde pro hřivny do nejbližší vsi s kovářem (Martin 20. 10. 2026). Hřivny jsou výrobek kovárny, kovář za ně bere obilí. Hřivny doma vůz dokončí (`cartIronDay` krok 2 beze změny).
   - **Hotová zakázka** (`order-ready`) → výprava pro ni týž den (bod 6).
   - Pobyt `MARKET.minStayDays`, posádka `marketCrew`, odchod jen přes `departMarketInPlace` (kontroly `checkMarketTrip`, volní lidé `marketFreeAdults`). Neprojde-li kontrola, ves nejede.
8. **Správce na trhu** – jen zapnutý správce (`state.steward`), stejnou akcí jako hráč (`departMarketInPlace`):
   - **Obilí v nouzi** v den správce: port `grainStep` / `grainDealWith` / `grainPayment` (`steward/steward-needs.ts` @ `b4f8dadc`). Chybí-li aspoň `STEWARD.grainMinKg` (`TRADE.porterKg`) a nic jeho není na cestě, pošle výpravu. Platí zbožím `STEWARD.grainPayment` (hřivny, keramika, uhlí, klády) do hodnoty chybějícího obilí, klády jen nad rezervu staveb (`constructionLogsLeft`), nosičů nejvýš `STEWARD.grainPorterShare` 0,5 dospělých; nevejde-li se výprava, zmenší nákup úměrně, nejvýš `FIT_TRIES` = 4× (technická mez, ne pravidlo – výpočet musí skončit; port i s komentářem).
   - **Rotace cílů:** správce jede do nejbližší vsi okolí, odkud se jeho výprava za obilím nevrátila s prázdnou (`trade.grainMisses`). Prázdný návrat (výprava sháněla obilí a nekoupila žádné) ves do seznamu přidá, takže příště jede jinam a k téže vsi denně nejezdí. Když jsou v seznamu všechny vsi okolí, nejede, dokud nepřijde nové okolí – seznam platí jen se stejným `nearby.day` (nejdéle 30 dní, technická mez z bodu 1).
   - **Potřeba vsi** jednou ročně 15. 11. (s vesničany) – návrh Clauda, Martinovi se oznámí: opírá se o Martina 22. 11. 2026 („Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“) a pravidlo 9 (správce sestavuje výpravy jako hráč). `give` = nabídka, `wants` = co ves shání (`marketStance` vlastní vsi), když shání něco. Cíl se střídá po letech (`nearby.villages[rok % počet]`, okolí řazené podle `cells`, pak `villageId`), ať správce okolí pozná. Bez paměti navíc.
9. **Kovář souseda ke koním** (Martin: „kovář z jiné vsi … násobně dražší, protože musí přijít“; „musí fyzicky dojít do té ohrady“):
   - Ves s koňmi po termínu bez vlastního kováře pošle `smith-ask` nejbližší vsi okolí, kde je podle zprávy kovář. Dotaz čeká do `shoeing.asked.untilDay` = den, kdy by kovář dorazil, kdyby vyrazil hned (den dotazu u kováře + 1 + dny cesty), + `MARKET.minStayDays` – odvozené z časů trhu, žádné nové číslo. Uplyne-li bez kování, další dotaz jde **jiné vsi s kovářem** – další za `asked.villageId` v pořadí okolí (dokola; jediná taková ves → zase ona, dotaz nic nestojí).
   - Ves kováře dotaz přijme, když kovář pracuje, je doma a hřivny vsi stačí na koně (0,5 kg na koně, `HORSE_SHOEING.ironBarsKg`) nad její rezervu na vlastní kování (`shoeingBarsKg`). Pak kovář vyrazí jako výprava (`answerSmithAsk`): hřivny v `give`, `service` = kování, sám bez nosičů (`alone`). Kovář je pryč (`Person.away`, druh `'craft'`) po dny cesty, takže kovárna ty dny nekuje.
   - U koní kovář kuje hned po příjezdu (`serveShoeing`): termín se posune, kronika „Kovář z <ves> okul koně“. Ves zaplatí poplatek z `paymentPool` i z pojistky (dřívější návrh Clauda „cizí kovář platí i z pojistky“): (0,5 čd × koně + dny cesty tam a zpět + `MARKET.minStayDays`) × den řemeslníka v obilí + hodnota hřiven. Den řemeslníka = `TRADE_GOOD_VALUES.woodTools.valueKg` ÷ `CARPENTRY.woodToolsManDaysPerKg` = 2 ÷ 0,5 = 4 kg – jako den tesaře v dřívější ceně vozu (`cartValueKg` @ `b4f8dadc`), nové číslo nevzniká. Dřív se poplatek počítal z ceny jídla v práci vsi (`villageFoodCosts` v `shoeingCosts` @ `b4f8dadc`); změnu zapíše Úloha 12 do horses.md. Hřivny i poplatek jdou výsledkem domů.
   - Výprava kováře do zápočtu nevstupuje – hřivny kováře se neprodají. Nepotřebuje-li ves už kování, kovář nic nebere a hřivny se vrátí (`unsold`).
10. **Lidé na trhu – výměna lidí a noví osadníci** (dřívější výměna lidí, Martin 19. 10. 2026: „celé rodiny i jen dospělí“, „muži a ženy zvlášť“):
    - Kdo smí odejít, vybírá `emigrantGroups` (beze změny – ne dvorec, dědic, rozpad domácnosti, muži rodu a jejich ženy). Při odjezdu konkrétní lidé odejdou ze vsi (`removePeople`) jako náklad `MarketPerson` { `good`, `people` }. Kontrola výpravy je mezi volnými dospělými (nosiči) nepočítá.
    - Prodaní lidé se usadí u kupce (hostitel hned `settlePeople`, výprava je odveze domů). Neprodaní se vrátí s výsledkem a dostanou zpět svá id (`restorePeople`).
    - Hostitel shání lidi obráceně k `peopleSpare`: když je půdy víc než práce (`landHa > laborHa` ve výhledu správce), shání `ceil(dospělí × (landHa ÷ laborHa − 1))` dospělých jako rodiny (dva dospělí na rodinu, nahoru). Vesničané lidi neprodávají ani nekupují – jen hráč a správce.
11. **Sňatky se skutečnými sousedy** (Martin: „na náhodě, ze které dostupně vsi ženich nebo nevěsta bude“; „Jen se vdá pryč“ – 23. 11. 2026). Ves bez okolí jako dnes – jen ve vsi.
    - **Kdo se ptá:** svobodný od `MARRIAGE.neighbours.fromAge` 18 let, který ve vsi nemá s kým (`bestMatch` nic). Muž s denní šancí z `bridePerYear` 0,3 ročně. Žena jen „vdova nebo dcera z domu bez mužů“ (Martin 19. 10. 2026; `favouredBride` – vdova, dědička, dům bez muže od 16) se šancí z `favouredGroomPerYear` 0,5 – ženich přijde k ní. **Svobodná žena, která dům nedrží, se sama neptá nikdy** – vdá se pryč, jen když se na ni zeptá muž odjinud. Ne v hladu, ne do přeplněného domu, pod pojistkou zásob menší šance (`weddingChancePerDay`) – vše jako dřív `outsideMarriages`. Kdo se dnes vzal ve vsi, už není svobodný (`arrangeMarriages` běží dřív); snoubenci čekající na zásoby mají `bestMatch`, takže se neptají – paměť `married` ze starého `outsideMarriages` netřeba.
    - **Kam:** náhodná ves (los z proudu `'kin:' + den`) jen mezi vsemi okolí, které mají podle `singles` vhodný protějšek – opačné pohlaví, věk v rozdílu `maxAgeGap`, u další manželky žena 16–22. Žádná taková ves → dnes se neptá. Slepý los není (neighbours.md – Pravidla 8: „z náhodně vybrané sousední vsi, kde je volný ženich nebo nevěsta“). Zpráva `kin-ask` s popisem hledajícího.
    - **Kdo přijde** (`kinCandidates`): ves partnera vybere svobodného opačného pohlaví bez protějšku ve vsi, doma, ve věkovém rozdílu (`maxAgeGap`), nejbližšího věkem, při shodě nižší id, bez losu. Ne muže rodu ani jeho ženu (`keptByLine`), ne vdovu, dědičku ani ženu z domu bez mužů (`favouredBride` – ty se pryč nevdávají), nikoho s dětmi do 16 (partner jde vždy sám) a jen když se domácnost odchodem nerozpadne (`householdBreaksUp`). Partner jede výpravou `kin` ke hledajícímu. Ve své vsi „se vdala pryč“ / „přiženil se pryč“.
    - **Pohyb jen jedním směrem – partner jde za hledajícím.** Nevěsta jde k muži, ženich k vdově či dědičce, jako `weddingHome` ve vsi.
    - **Po příjezdu** (`receiveKin`): žije-li hledající a je pořád svobodný, je svatba; jinak partner zůstane jako svobodný nováček (`newcomerHome`). Nikdo se nevrací – kdo přišel, už je ve vsi. Hledající odpověď neeviduje, vzácnou druhou odpověď vyřeší totéž pravidlo.
    - Žádná odpověď = nikdo nepřijde, hledající se může zeptat znovu dalším losem.
12. **Další manželky mužů rodu (2.–4.) se vracejí ze skutečných sousedních vsí** – návrh Clauda, Martinovi se oznámí (plán 1, Rozhodnutí 6: „do plánu 3 nepřibývají“; lord-history.md – dřívější pravidlo). Port `extraWivesDay`, `extraWifeHome`, `wifeCounts` z `people/dynasty-wives.ts` @ `b4f8dadc`: muž rodu od 18 let s 1–3 žijícími manželkami se ptá se šancí `MARRIAGE.neighbours.extraWifePerYear` 0,3 ročně; jen ves se sledovaným rodem (`isDynastyTracked`), ne pokřtěný rod (`rodBaptized` – christianity.md, Jediná manželka) a jen muž s domem (`extraWifeHome`). Partnerka je žena `brideAge` 16–22 let bez protějšku ve své vsi. Ves tak nebere ženy mužům vsi – důvod, proč lord.md bralo další manželky „z okolí“. Přijde vždy do domu muže, i do přeplněného; nejvýš `LORD.maxWives` = 4 žijící. V hladu se neptá.
13. **Oběh mezi vsemi:**
    - Výpravy jdou poštou z plánu 2 beze změny. Výsledek nese i lidi (`MarketResult.people` – neprodané vlastní, `newcomers` – koupené).
    - Zaniklý hostitel vrátí výpravu se vším, co drží, i s lidmi (`marketResult(…, { returned: true })`). Domovská ves je usadí s jejich původními id (`restorePeople`).
    - **Výsledek s lidmi pro domovskou ves, která chybí, spí nebo má sídlo v archivu, se nezahodí:** lidé jdou zprávou `stranded-people` zpět k hostiteli. Skupiny, které prodal sám hostitel (`MarketPerson.fromHost` – `settleTrades`, větev `seller === HOST`), se vrátí s původními id (`restorePeople`, kronika `newcomer` s `returned`); ostatní – vlastní lidé výpravy a koupení od jiné výpravy – se u něj usadí s novými id (`settlePeople`). (Opravné kolo 1 úlohy 10: dřívější párování podle `emigrants` – týž id a `bornDay` – dalo cizí skupině id emigranta nebo předka hostitele a v řetězu člověk zmizel.) Zboží výsledku se zahodí jako v plánu 2 – zboží s vsí zanikne, lidé ne; vrácené zboží by hostitel měl zaplacené podruhé. Výsledek, který domovská ves už použila (výprava není v jejím stavu), se nevrací.
    - **Domov zanikne, když už výsledek leží v jeho schránce** (návrh Clauda, Opravné kolo 1 úlohy 10: nikdo nesmí zmizet): úloha světa `returnStrandedPeople` (worker, `runWorldTasks`) najde výsledky s lidmi ve schránkách zaniklých vsí, nepoužité (výprava je ještě ve stavu vsi) pošle hostiteli jako `stranded-people` se stejným `ref` jako pošta a vyřízené ze schránky zaniklé vsi smaže.
    - **Jediná přijatá ztráta:** zanikl-li i hostitel (chybí, spí, sídlo v archivu), oba konce jsou mrtvé – lidé se ztratí. Totéž platí pro `stranded-people`, kterou hostitel nepoužije, protože zanikl.
    - Zprávy bez nákladu (`kin-ask`, `smith-ask`, `order-ready`) do vsi, která chybí nebo spí (`asleep` v otisku), se zahodí – nikdo nikam nejde.
    - `ref`: dotaz `kin:<ves>:<den>:<id hledajícího>:ask`, `smith:<ves>:<den>:ask`; ohlášení `order:<hostitel>:<kupec>:<zboží>:<den>`; `stranded-people` `<ref výsledku>:back`. Výpravy dál `market:<ves>:<id>` (`…:in`, `…:out`). Klíče dotazů jsou ze dne a id – bez počítadla ve stavu.
14. **Rozhraní:** panel Trh ukáže nové zboží (nástroje, dřevěné nářadí, vozy, muži, ženy, rodiny) s ikonami, které hra už má. Kronika a upozornění řeknou, kdo a kam jel:
    - „Vesničané jeli na trh do …“, „Správce poslal výpravu do …“,
    - „Nevěsta z <ves>“, „Ženich z <ves>“, „Dcera se vdala do <ves>“, „Syn se přiženil do <ves>“,
    - „Kovář z <ves> okul koně“, „Kovář šel kovat koně do <ves>“,
    - „Do vsi přišla rodina z <ves>“, „Zakázka v <ves> je hotová“.
    - Panel ohrady koní řekne v Tooltip, kdo kuje. Řádek výrobků ve dvorci ukáže zakázku („Nástroje – zakázka v Lhotě“).
    - Cizí správce v kronice, upozorněních ani tooltipech zakázek a kování nevidí jména ostatních vsí držitele – web místo nich napíše „sousední ves“ (stejná množina jako `marketOverview` pro něj). Jména nahradí server při skládání pohledu, klient je nedostane.
15. **Převod stavu:** žádný (Global Constraints). Dřívější druhy kroniky (`bride-from-outside`, `groom-from-outside`, `married-away`, `extra-wife`, `newcomer`, `horses-shod`) a `market-departed`, `market-returned`, `market-arrived` dostanou volitelné `villageName` / `villageId` – staré záznamy bez nich se čtou jako dřív.
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

    Úlohy 2–4 mění tytéž soubory trhu, proto jdou po sobě. 5 potřebuje 2–4, 7–9 potřebují 1 a 5, 11 všechny.

## Review Focus

1. **Lidé na cestě a cílová nebo domovská ves zanikne** (vymře, opustí se, Začít znovu archivuje sídlo, ves chybí) před příjezdem, během pobytu nebo před návratem výsledku – nevěsta, prodaná rodina, kovář:
   - vrátí se domů se svými původními id a vazbami na rodiče, pro zaniklou domovskou ves jdou zpět k hostiteli (`stranded-people`),
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
   - nový dotaz až po `shoeing.asked.untilDay`, a to jiné vsi s kovářem, je-li v okolí.

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
| 3     | `trade/goods.ts`, `trade/trade.ts`, `trade/market-stance.ts`, `trade/market-trip.ts`, `crafts/carts.ts`, `livestock/draft.ts`, `livestock/oxen.ts`, `types/types-market.ts`, `rules/rules-trade.ts`, `apps/web/lib/trade-names.ts`                             | vozy na trhu             |
| 4     | `trade/craft-orders.ts` (nový), `trade/market.ts`, `trade/market-trip.ts`, `trade/goods.ts`, `crafts/crafts.ts`, `crafts/carpentry.ts`, `core/inbox.ts`, `types/types-market.ts`, `types/types-state.ts`, `rules/rules-market.ts`                              | zakázky                  |
| 5     | `trade/villager-trips.ts` (nový), `trade/market-trip.ts`, `trade/market.ts`, `crafts/craft-buying.ts`, `core/simulate.ts`, `rules/rules-crafts.ts`, `rules/rules-fields.ts`, `types/types-chronicle.ts`                                                        | vesničané na trhu        |
| 6     | `steward/steward-market.ts` (nový), `steward/steward-needs.ts`, `trade/market-trip.ts`, `types/types-trade.ts`, `rules/rules-steward.ts`                                                                                                                       | správce na trhu          |
| 7     | `livestock/smith-visit.ts` (nový), `livestock/horse-shoeing.ts`, `trade/market.ts`, `trade/market-trip.ts`, `core/inbox.ts`, `core/simulate.ts`, `types/types-people.ts`, `types/types-market.ts`, `crafts/craft-buying.ts` (`paymentPool`)                    | kovář souseda            |
| 8     | `trade/market-people.ts` (nový), `trade/market.ts`, `trade/market-trip.ts`, `trade/market-stance.ts`, `trade/goods.ts`, `trade/trade.ts`, `domain/vassalage/spare.ts` (export `peopleSpare`), `types/*`, `rules/rules-trade.ts`, `apps/web/lib/trade-names.ts` | lidé na trhu             |
| 9     | `people/kin-match.ts` (nový), `people/marriage.ts`, `people/dynasty-wives.ts`, `trade/market.ts`, `core/inbox.ts`, `core/simulate.ts`, `application/nearby.ts`, `rules/rules-people.ts`, `rules/rules-lord.ts`, `types/*`                                      | sňatky a další manželky  |
| 10    | `application/village-mail.ts`, `trade/market-people.ts`, `trade/market.ts`, `core/inbox.ts`, `types/types-market.ts`, `application/__tests__/market-world.ts`, `village-mail.test.ts`, `advance-world.test.ts`                                                 | pošta a svět             |
| 11    | `apps/web/lib/village.ts`, `village-view-chronicle.ts`, `village-notices.ts`, `horse-view.ts`, `village-view-crafts.ts`, `market-view.ts`, `components/game/hud/MarketPanel.tsx`, `apps/web/e2e/market.spec.ts`, `packages/game/src/application/market.ts`     | web                      |
| 12    | `docs/design/markets.md`, `neighbours.md`, `kinship.md`, `lord.md`, `horses.md`, `wagons.md`, `crafts.md`, `steward.md`, `trade.md`                                                                                                                            | návrhy, ověření          |

Mapa kódu (`docs/code/*.md`) a testy, které úloha mění, jsou v jejích Files.

---

### Task 1: Okolí vsi (Opus)

> **Opravné kolo 1 (24. 11. 2026):** okolí v pevné dny – platí Rozhodnutí 1. Z rozhraní níž zůstaly typy, jádro (`trade/nearby.ts`) a `NEARBY_REFRESH_DAYS`; místo obnovy po dávce je `nearbyDays`, `nearbyVillages(deps, home)` (sken z otisků a sídel), port `NearbyRefresh` (`nearbyRefresh`, `villages.nearby`) a zápis v `updateVillage`. `nearbyStale`, `refreshNearby`, `refreshNearbySafely` ani napojení v `advancePlayer`, `advanceDynasty` a `dynastyForVillage` nejsou.

**Files:**

- Create: `packages/game/src/domain/village/trade/nearby.ts`, `packages/game/src/application/nearby.ts`
- Modify: `types/types-market.ts` (`NearbyVillage`, `VillageNearby`), `types/types-state.ts` (`nearby?`), `core/inbox.ts` (událost `nearby`), `application/market.ts` (export `villagesAt` se zúženým typem `deps: Pick<MarketDeps, 'villages' | 'settlements'>`, chování beze změny – čte jen `settlements.holderAt`, `settlements.listActive` a `villages.listBySettlement`), `application/advance-world.ts`, `application/advance-dynasty.ts` (volá poštu – `deliverVillageMailSafely`, ř. 46), `application/dynasty-for-village.ts`, `application/index.ts`
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
  // singles?: NearbySingle[] – přidá Úloha 9
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
/** Technická mez, ne pravidlo – okolí je snímek, který se celý nahradí (Rozhodnutí 1). */
export const NEARBY_REFRESH_DAYS = 30;
export type NearbyDeps = Pick<MarketDeps, 'villages' | 'settlements'>;
export function nearbyStale(state: VillageState): boolean; // chybí, nebo lastDay − nearby.day ≥ NEARBY_REFRESH_DAYS
export async function nearbyVillages(
  deps: NearbyDeps,
  villageId: string,
): Promise<VillageNearby | null>; // day = lastDay + 1
export async function refreshNearby(deps: NearbyDeps, villageId: string): Promise<boolean>; // true = zapsáno
export async function refreshNearbySafely(deps: NearbyDeps, villageId: string): Promise<boolean>; // chyba do logu, false
```

`nearbyVillages`: sídla na 8 sousedních políčkách (`villagesAt`, i vsi vlastního hráče), záznam každé vsi z `villages.find` (jméno, `sleeps`; Úloha 9 z něj spočítá `singles`), bez spících (`sleeps`), bez archivovaných (`placeOf` null) a přes odříznutí (`crossesIsolation`). `cells` = vzdálenost políček jako v `marketOverview`, `firstStep` = `stepToward`, `self.name` = jméno záznamu vsi. Spící nebo odříznutá ves sama nedostane nic (null). `refreshNearby` zapíše `inbox.post({ villageId, day: lastDay + 1, ref: 'nearby:' + villageId + ':' + (lastDay + 1), body: { kind: 'nearby', nearby } })`.

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
- [ ] **Step 4: Implementovat** typy, `applyNearby` (větev `applyEvent`), `trade/nearby.ts`, `application/nearby.ts`. Worker: v `advancePlayer` ve stejném `tryRun` jako pošta (`deliverVillageMailSafely`) – po doručení `if (nearbyStale(village.state)) await refreshNearbySafely(deps, id)`, i ve větvi `stamp.lastDay >= to` (ves se načte jen kvůli otisku – použij `villages.find`). Totéž v `advanceDynasty` a `dynastyForVillage` u celých vsí (obě poštu doručují).
- [ ] **Step 5: Spustit** testy ze Step 3 – PASS; `npm run test:db`.
- [ ] **Step 6: Mapa kódu**, kontroly z Global Constraints, commit `feat(game): okolí vsi – sousední vsi ve stavu vsi (plán 3)`.

### Task 2: Výrobky dílen jako zboží trhu (Opus)

**Files:**

- Modify: `types/types-trade.ts` (`TradeGood` += `'tools' | 'woodTools'`), `trade/goods.ts` (`TRADE_GOODS` – za `pottery`), `rules/rules-trade.ts` (`TRADE_GOOD_VALUES.tools = { valueKg: 60, carryKg: 1 }`, `woodTools = { valueKg: 2, carryKg: 1 }` – komentář s původem z `b4f8dadc` `CRAFT_BUYING`), `trade/trade.ts` (`villageGoodStock`, `addGood`), `trade/market-stance.ts`, `apps/web/lib/trade-names.ts` (název a ikona – ikony nástrojů a dřevěného nářadí z lišty či panelu dílny)
- Modify: `docs/code/village-trade.md` (Trh – co ves nabízí a shání; Kůže… – seznam zboží)
- Test: `trade/__tests__/market-stance.test.ts`, `trade/__tests__/trade.test.ts` (nebo kde jsou testy `villageGoodStock`), `trade/__tests__/market-two-villages.test.ts`, beze změny `trade/__tests__/market-clearing.test.ts`

**Interfaces:**

- Consumes: `toolEquipmentKg`, `toolNeedKg` (`crafts/iron.ts`), `craftTargets`, `craftStocks`, `smithBarsTargetKg`, `ironOrderBarsKg` (`crafts/crafts.ts`), `ownCraftsmanWorks` (`crafts/craft-buying.ts`).
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
- [ ] **Step 3: Implementovat** podle Interfaces. `TRADE_GOOD_NAMES` ve webu doplnit hned (typecheck – `Record<TradeGood, …>`). `TRADE_GOODS` je i pořadí zápočtu – `market-clearing.test.ts` a dosavadní případy `market-two-villages.test.ts` (bez nového zboží) musí projít beze změny očekávání.
- [ ] **Step 4: Spustit** testy ze Step 2 – PASS; `nice -n 19 npm run test:slow` (zlaté otisky beze změny – stance se počítá jen v tržní den).
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): nástroje a dřevěné nářadí jako zboží trhu, výrobky v nabídce vsi (plán 3)`.

### Task 3: Vozy na trhu (Opus)

**Files:**

- Modify: `types/types-trade.ts` (`TradeGood` += `'twoWheelCarts' | 'fourWheelCarts'`), `trade/goods.ts` (`CART_GOODS`, `cartGoodKind`, `PIECE_GOODS`), `rules/rules-trade.ts` (`{ valueKg: 320, carryKg: 0 }` a `{ valueKg: 640, carryKg: 0 }` – komentář s výpočtem dřívějšího `cartValueKg`), `crafts/carts.ts` (`idleCartsOf`, `removeIdleCart`), `livestock/draft.ts` (`cartsWanted` vedle `missingCart` – `draft.ts` importuje `carts.ts`, v `carts.ts` by vznikl cyklus importů), `livestock/oxen.ts` (`oxenAway` + `trip.oxen`), `trade/trade.ts`, `trade/market-stance.ts`, `types/types-market.ts` (`MarketTrip.oxen?`), `trade/market-trip.ts` (`checkMarketTrip`, `planMarketTrip`, `departMarket`, `marketTripsDay`, `applyMarketResult`), `apps/web/lib/trade-names.ts`
- Modify: `docs/code/village-trade.md` (Výprava na trh – voli pro koupený vůz, prodaný vůz), `docs/code/village-crafts.md` (Tesař a vozy – vůz z trhu)
- Test: `trade/__tests__/market-trip.test.ts`, `trade/__tests__/market-stance.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `addCart`, `missingCart`, `cartTargets`, `cartsAway`, `tradeHomeCarts`, `cartsWithOxen`, `DRAFT_OXEN` / `cartOxen`, `oxenHome` (plán 2 `planMarketTrip`).
- Produces:

```ts
export const CART_GOODS: readonly ('twoWheelCarts' | 'fourWheelCarts')[];
export function cartGoodKind(good: 'twoWheelCarts' | 'fourWheelCarts'): CartKind;
/** livestock/draft.ts – kolik vozů druhu ves chce: cartTargets(state)[kind] (wagons.md, Kolik vozů ves chce). */
export function cartsWanted(state: VillageState, kind: CartKind): number;
/** Vozy druhu mimo cartsAway(state) – výpravy, nákupy i vůz na cestě pro kování (ironTrip); v pořadí id. */
export function idleCartsOf(state: VillageState, kind: CartKind): Cart[];
/** Odebere nejmladší volný vůz druhu (nejvyšší id, prodej); bez volného nic. */
export function removeIdleCart(state: VillageState, kind: CartKind): void;
/** Voli na koupené vozy ze seznamu: Σ cartOxen(druh) × kusy. */
export function oxenForCarts(wants: TradeGoods): number;
// MarketTrip.oxen?: number – vycvičení voli bez vozu, kteří jdou s výpravou a potáhnou koupené vozy domů
```

- `villageGoodStock(s, 'twoWheelCarts', day)` = `idleCartsOf(s, 'two-wheel').length`; `addGood` +n = `addCart` n×, −n = `removeIdleCart` n×.
- Stance: nabízí `idleCartsOf − cartsWanted` (je-li kladné), bez pracujícího tesaře shání 1 vůz druhu `missingCart(state)`.
- **Prodaný vůz nejede jako dopravní:** `checkMarketTrip` odebere z `homeCarts` posledních `give[g]` vozů druhu – `planMarketTrip` dává `homeCarts` v pořadí `tradeHomeCarts` (druh, pak id), takže jsou to nejmladší volné vozy, tytéž, které pak `departMarket` prodá přes `addGood` → `removeIdleCart`. Teprve na zbylých vozech `cartsWithOxen` a `marketCrew`; `cartIds` vybírá `planMarketTrip` jen z nich. Náhled ve webu tak počítá stejně. Prodaný vůz odjede bez spřežení jako prodaní voli (plán 2, Rozhodnutí 5).
- `checkMarketTrip`: vozy v `wants` jen když `oxenHome − voli dopravních vozů − give.trainedOxen ≥ oxenForCarts(wants)` (nový důvod `MARKET_NO_OXEN = 'Koupený vůz by domů neměl kdo táhnout.'`); výsledek kontroly nese `oxen`. Hráč voly nezadává – spočítá je server i náhled ve webu touž funkcí.
- `departMarket` uloží `trip.oxen`. `oxenAway` (`livestock/oxen.ts`) přičte `e.market?.oxen` výprav v `trade.expeditions`, takže `oxenHome` je bere jako pryč. `marketTripsDay` v `returnDay` smaže `e.carts` i `e.market.oxen` – podmínka už nesmí vyžadovat `e.carts`.

- [ ] **Step 1: Testy:**
  - `checkMarketTrip({ give: {}, wants: { twoWheelCarts: 1 }, stayDays: 1 }, { …, oxenHome: 0 })` → `MARKET_NO_OXEN`; s `oxenHome: 2` projde s `oxen: 2`. `planMarketTrip` + `departMarket` → `oxenHome(state, D + 1)` o 2 menší až do `returnDay − 1`, v `returnDay` zpět (`market.oxen` smazané).
  - Prodej vozu: ves se 2 volnými dvoukoláky (id 1 a 2) a 1 vycvičeným volem, `give: { twoWheelCarts: 1, grain: 400 }` (náklad, se kterým `marketCrew` vůz použije – jinak víc obilí) → kontrola počítá s jedním dopravním vozem, `cartIds = [1]`, prodá se vůz 2; po odjezdu `villageCarts` = [vůz 1] a vůz 1 je v `cartsAway`.
  - Stance: ves bez tesaře bez vozu (`missingCart` = 'two-wheel') shání `twoWheelCarts: 1`; ves s tesařem a 2 volnými dvoukoláky při `cartsWanted` 1 nabízí `twoWheelCarts: 1`.
  - Dvě vsi: H (bez tesaře, 2 volní vycvičení voli, `give: { grain: 400 }`, `wants: { twoWheelCarts: 1 }`) a M (s tesařem, 2 volné dvoukoláky, chce obilí) → H má po návratu o vůz víc (`villageCarts(h).length + 1`), M o jeden méně (ten s vyšším id), voli H jsou doma v `returnDay`.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts packages/game/src/domain/village/livestock` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): vozy na trhu – prodej, nákup a voli pro koupený vůz (plán 3)`.

### Task 4: Zakázky u řemeslníka a obilí za výrobky (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/craft-orders.ts`
- Modify: `types/types-market.ts` (`CraftOrder`, `VillageMarket.orders?`, `MarketResult.ordered?`, `PlacedOrder`, `OrderReady`, mail `order-ready`), `types/types-state.ts` (`orders?`), `types/types-chronicle.ts` (`order-ready` { `villageName`, `villageId`, `good` }), `trade/goods.ts` (`ORDER_GOODS`, `ORDER_CRAFT`), `trade/market.ts` (`marketDay` volá `craftPayWants`, `departVisitors`, `settleTrades`), `trade/market-trip.ts` (`applyMarketResult`), `core/inbox.ts`, `crafts/crafts.ts` (`restingCrafters`, `smithIronDeficit` přes `orderTargets`), `crafts/carpentry.ts` (`nextProduct`), `rules/rules-market.ts` (`MARKET.orderDays = 365` – „technická mez, ne pravidlo“, důvod z Rozhodnutí 6), `core/simulate.ts` (`fillOrders` po práci dne)
- Modify: `docs/code/village-trade.md` (nový odstavec „Zakázky“, „Obilí za výrobky“), `docs/code/village-crafts.md` (výroba na zakázku)
- Test: `trade/__tests__/craft-orders.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `marketStance`, `departVisitors` (plán 2), `ownCraftsmanWorks`, `PRODUCT_CRAFT` (`crafts/craft-buying.ts`), `priceOf` (`trade/market-prices.ts`), `craftTargets`, `toolNeedKg`, `smithBarsTargetKg`, `cartsWanted` (Úloha 3, `livestock/draft.ts`).
- Produces:

```ts
export type OrderGood =
  'tools' | 'pottery' | 'woodTools' | 'ironBars' | 'twoWheelCarts' | 'fourWheelCarts';
export const ORDER_GOODS: readonly OrderGood[];
/** Jediná mapa řemesel výrobků: tools, pottery, woodTools z PRODUCT_CRAFT (toolsKg, potteryKg, woodToolsKg), ironBars → smith, vozy → carpenter. */
export const ORDER_CRAFT: Readonly<Record<OrderGood, Craft>>;
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
/**
 * Řemeslník bere obilí vždy (Martin 24. 11. 2026; mutuje `stance.wants`, volá marketDay před zápočtem):
 * hostitel shání navíc obilí, pak luštěniny nejvýš za hodnotu výrobků svých pracujících dílen, které
 * ten den nabízí a výpravy shánějí.
 */
export function craftPayWants(
  state: VillageState,
  day: number,
  stance: MarketStance,
  visitors: readonly MarketVisitor[],
  prices: MarketPrices,
): void;
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

Pravidla (Rozhodnutí 5 a 6):

- `craftPayWants` – hodnota V (v mincích) = Σ přes `g ∈ ORDER_GOODS` s `ownCraftsmanWorks(host, ORDER_CRAFT[g])` z `min(stance.offer[g], Σ visitors wants[g]) × priceOf(prices, g)`. Obilí navíc za `min(V, Σ visitors goods.grain × cena obilí)`, luštěniny za zbytek V nejvýš do toho, co výpravy luštěnin vezou; přičte se k `stance.wants` (v kg přes cenu). Bez takových výrobků nic.
- `recordOrders` – v `departVisitors` před výsledkem. Pro každé `g ∈ ORDER_GOODS` se zbytkem `visitor.wants[g] > 0` a `ownCraftsmanWorks(host, ORDER_CRAFT[g])`, když výprava pořád veze obilí nebo luštěniny nebo něco z `hostWants`, zapíše/nahradí `CraftOrder` (`villageId` = `visitor.fromVillageId`). `ordered` jde do `MarketResult.ordered`.
- `reduceOrder` – v `settleTrades`, když hostitel prodá zakázkové zboží návštěvníkovi téže vsi (zakázka 0 se smaže).
- Vlastní potřeba pro výrobu: `restingCrafters` a `smithIronDeficit` berou `toolNeedKg + orders.tools` a `smithBarsTargetKg + orders.ironBars`; keramika `craftTargets.potteryKg + orders.pottery`; tesař (`nextProduct`) dřevěné nářadí `+ orders.woodTools`, vůz i když `missingCart` nic, ale volných vozů druhu je méně než `cartsWanted + orders`. Funkce `craftTargets` sama se nemění (správce a výhledy počítají jen vlastní potřebu). Kovárna dál jde do práce až od celého dne práce (`smithRests`) – zakázka menší než den práce ji nespustí, dokud vybavení opotřebením neklesne.
- `fillOrders` – po práci dne: pro živé zakázky bez `readyDay` v pořadí `day`, pak `villageId`. Zásoba nad vlastní potřebou (stance bez zakázek) se rozdělí postupně. Pokrytá zakázka dostane `readyDay` a do `outbox` jde `order-ready` na den `day + 1 + marketTravelDays(cells)` (posel; `cells` z okolí, není-li kupující v okolí, 1), `ref` `order:<hostitel self>:<kupec>:<good>:<day>`. Bez okolí (`self` chybí) se neohlašuje.
- `rememberOrders` – v `applyMarketResult`: zboží z `ordered` → `open`. Zboží ze seznamu výpravy, které nekoupila ani neobjednala → `refused`. Koupené → zakázka u té vsi se smaže.
- `markOrderReady` – `open` → `ready`, kronika `order-ready` { `villageName`, `villageId`, `good` } (Úloha 11 dá text).

- [ ] **Step 1: Testy** (`craft-orders.test.ts`):
  - `craftPayWants`: hostitel s kovářem nad pojistkou (`stance.wants.grain` chybí, nástroje 12 kg nad potřebou), výprava chce 10 kg nástrojů a veze 900 kg obilí → `wants.grain = 600` (výchozí ceny 60 : 1), luštěniny ne; výprava s 300 kg obilí a 500 kg luštěnin → `grain 300`, `legumes 300`; dvě výpravy, každá chce 10 kg a veze 900 kg obilí → hodnota 12 kg nabídky (`grain 720`); bez pracujícího kováře → `wants` beze změny.
  - Odjezd s nekoupenými nástroji 10 kg od kováře, s obilím ve voze → `market.orders = [{ villageId: H, good: 'tools', amount: 10, day: D }]`, `result.ordered = { tools: 10 }`, i když hostitel obilí neshání. Bez kováře, nebo když výprava neveze obilí, luštěniny ani nic, co hostitel shání → žádná zakázka.
  - Druhá výprava téže vsi chce 4 → zakázka 4 (nahrazena, ne 14).
  - `orderTargets` po `MARKET.orderDays + 1` dnech → 0 (vypršela).
  - Kovář s otevřenou zakázkou nástrojů aspoň na celý den práce kovárny (množství test spočítá z `ironWorkManDays` a práce dílny, ne z hlavy) kuje i při vybavení na `toolNeedKg` (`restingCrafters` ho nepošle odpočívat), bez zakázky odpočívá; se zakázkou menší než den práce odpočívá také (`smithRests`).
  - `fillOrders`: zásoba nástrojů 12 kg nad potřebou, zakázky H 10 a K 5 (H dřív) → H `readyDay`, v `outbox` jedna zpráva `order-ready` pro H, K nic; podruhé se neohlásí.
  - Kupující: `rememberOrders` s `ordered: { tools: 10 }` a nekoupenou keramikou → `tools` `open`, `pottery` `refused`; `markOrderReady` → `ready`.
- [ ] **Step 2: Test dvou vsí** (`market-two-villages.test.ts`, nový případ „zakázka“): H chce 10 kg nástrojů, M (kovář, nástroje na potřebě, nad pojistkou – obilí neshání) nemá co prodat → zakázka. M se dopočte dál, dokud nepošle `order-ready` (nejvýš 60 dní). Druhá výprava H koupí 10 kg za obilí. V součtu: nástroje M vyrobené navíc = nástroje, které přibyly H; obilí jen mezi H a M.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces; větev `order-ready` v `applyEvent`.
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (bez zakázek a výprav se výroba ani trh nemění – zlaté otisky).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): zakázky u řemeslníka a obilí za výrobky (plán 3)`.

### Task 5: Vesničané na trhu (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/villager-trips.ts`
- Modify: `trade/market-trip.ts` (`departMarketInPlace`, `TradeExpedition.by?`, příjezd nese `firstStep`, `market-departed` / `market-returned` `villageId`), `trade/market.ts` (`joinMarket` – `MarketVisitor.firstStep`, `market-arrived` `villageId`), `crafts/craft-buying.ts` (port `yearlySaving`, `withToolCoverage`, `BuyingContext`, `pay` z `b4f8dadc` beze změny vzorců), `core/simulate.ts` (krok `villagerTripsDay` hned za `seedReserveDay`), `rules/rules-crafts.ts` (`CRAFT_BUYING.day`, `minKg`), `rules/rules-fields.ts` (`SEED_RESERVE.maxCows = 1` i s původním komentářem `SEED_BUYING`), `types/types-trade.ts` (`TradeExpedition.by?`), `types/types-market.ts` (`MarketArrival.firstStep`, `MarketVisitor.firstStep`), `types/types-chronicle.ts` (`market-departed` / `market-returned` `by?`, `villageId?`; `market-arrived` `villageId?`)
- Modify: `docs/code/village-trade.md` (nový odstavec „Vesničané na trhu“), `docs/code/village-crafts.md` (Nákup u sousedů → na trhu), `docs/code/village-fields.md` (Osivo – nákup na trhu)
- Test: `trade/__tests__/villager-trips.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearestWith`, `nearestNearby`, `nearbyTarget`), Úlohy 2–4 (zboží, `cartsWanted`, `ORDER_CRAFT`, `placedOrder`), plán 2 (`planMarketTrip`, `marketCrew`, `marketTravelDays`, `priceOf`), `paymentPool`, `seedShortKg`, `surplusCows`, `ironOrderBarsKg`, `ownCraftsmanWorks`, `SEED_RESERVE`.
- Produces:

```ts
export type TripBy = 'villagers' | 'steward' | 'smith' | 'kin';
// TradeExpedition.by?: TripBy; ChronicleEvent market-departed / market-returned: by?: TripBy, villageId?: string
// market-arrived: villageId?: string (ves výpravy); MarketArrival.firstStep / MarketVisitor.firstStep: Direction8 (směr od domovské vsi k hostiteli – target.firstStep)
/** Jako departMarket, ale mutuje stav (krok dne – bez klonu celé vsi). departMarket = klon + tohle. */
export function departMarketInPlace(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
  options?: { by?: TripBy },
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
- `departMarketInPlace` je dosavadní tělo `departMarket` bez klonu; dřívější `stewardAction` (nastavoval `state.lastDay = day` kvůli `launchExpedition`) se neobnovuje – den jde parametrem. Kronika `market-departed` a `market-returned` nese `villageId` cíle (`target.villageId`, `trip.villageId`), `market-arrived` u hostitele `villageId` výpravy (`arrival.fromVillageId`) – Úloha 11 podle nich maskuje jména.
- **Cena v kg obilí** u cíle: `priceOf(news.prices, g) × MARKET.grainKgPerCoin`, bez zprávy výchozí `TRADE_GOOD_VALUES[g].valueKg`. Platba obilím a luštěninami z `paymentPool` v kg obilí stejnou cenou cíle – řemeslník je bere vždy (Úloha 4 `craftPayWants`).
- **Výrobky 15. 11.:** port `planPurchases`. `nearestCraftsman` → `nearestWith(state, ORDER_CRAFT[g])` (vůz – tesař). Přeskočí výrobek s vlastním pracujícím řemeslníkem, s živou zakázkou `open` a cíl s `refused`. `carryKg` a vozy nákupu nahrazuje `marketCrew` (nosiči × (2 × cesta + 1) = cena cesty v čd). Vůz chce volné vycvičené voly (`cartOxen`). Nákupy jednoho cíle jedou jednou výpravou.
- **Osivo 1. 9. a 1. 3.** (`SEED_RESERVE.days`): `seedShortKg ≥ SEED_RESERVE.minKg` → `wants.grain` = chybějící kg, `give` hřivny, pak krávy z `surplusCows` (nejvýš `SEED_RESERVE.maxCows`) do hodnoty osiva cenou cíle. Cíl `nearestNearby`.
- **Hřivny na kování vozu (kdykoli):** `ironOrderBarsKg > ironBarsKg`, bez vlastního pracujícího kováře, bez výpravy vesničanů s hřivnami na cestě, bez živé zakázky `open` a bez `refused` u cíle. `wants.ironBars` = rozdíl, platba z `paymentPool`, cíl `nearestWith(state, 'smith')`.
- **Hotová zakázka:** `status: 'ready'` → týž den výprava pro ni (wants = zakázka) s platbou z `paymentPool`, zakázka pak `open` do výsledku.
- Pobyt `MARKET.minStayDays`. `departMarketInPlace(…, { by: 'villagers' })`. Odmítne-li `planMarketTrip`, ves dnes nejede (bez opakování v tentýž den).

- [ ] **Step 1: Testy** (`villager-trips.test.ts`, přípravky `market-fixtures.ts` + `nearby`):
  - Bez okolí: 15. 11. ves bez kováře s nedostatkem nástrojů → žádná výprava, `outbox` není (a stav = stav bez kroku).
  - S okolím a zprávou „M má kováře“: 15. 11. → jedna výprava `by: 'villagers'`, `market.villageId = M`, `wants.tools` = `planVillagerPurchases(…)[0].amount` (> `CRAFT_BUYING.minKg`), `give.grain` = hodnota × cena; 14. 11. nic. Kronika `market-departed` má `villageId: M`, `by: 'villagers'`.
  - Zpráva bez kováře → pro nástroje nikam; ves s vlastním pracujícím kovářem → nikam.
  - Zakázka `open` na nástroje u M → 15. 11. pro nástroje nejede; zpráva `order-ready` na 20. 11. → týž den výprava odeslaná (`startedDay` 21. 11.).
  - 1. 9. s osivem kratším o 200 kg, hřivnami 2 kg a 3 krávami nad potřebou → `wants.grain = 200`, `give.ironBars = 2`, `give.cows = 1` (hodnota hřiven 90 < 200, kráva doplní); s `seedShortKg` 3 kg nic.
  - Vůz čeká na kování, bez kováře, zpráva M s kovářem → výprava `wants.ironBars = cartIronBarsKg('two-wheel')` hned ten den; druhý den znovu ne (výprava na cestě).
  - Determinismus: dopočet 1. 11. → 30. 11. vcelku a po kouscích (1.–14. 11., 15.–30. 11.) dá shodný stav i `outbox`.
- [ ] **Step 2: Test dvou vsí:** H (bez kováře, okolí M, zpráva M s kovářem) a M (kovář, nástroje nad potřebou, **nad pojistkou – obilí neshání**) od 14. 11. Po kole tam a zpět má H o `planVillagerPurchases` kg vybavení víc, M o tolik méně a o zaplacené obilí víc (Martin 24. 11. 2026 – řemeslník bere obilí vždy). Kronika M `market-arrived` má `villageId: H`, kronika H `market-returned` `villageId: M`.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/crafts packages/game/src/domain/village/fields` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces. Pravidla v kódu s odkazem „markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7“. Obnovená čísla s původním odkazem (`b4f8dadc`).
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (bez okolí beze změny).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): vesničané jezdí na trh pro výrobky, osivo a hřivny na kování (plán 3)`.

### Task 6: Správce na trhu (Sonnet)

**Files:**

- Create: `packages/game/src/domain/village/steward/steward-market.ts`
- Modify: `steward/steward-needs.ts` (`needSteps` volá kroky trhu), `trade/market-trip.ts` (`applyMarketResult` zapíše prázdný návrat do `trade.grainMisses`), `types/types-trade.ts` (`VillageTrade.grainMisses?`), `rules/rules-steward.ts` (`STEWARD.grainMinKg`, `grainPorterShare`, `grainPayment` – z `b4f8dadc` i s komentářem a datem Martinova „A“ 8. 11. 2026)
- Modify: `docs/code/village-steward.md` (nový odstavec „Správce na trhu“)
- Test: `steward/__tests__/steward-market.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearbyTarget`, `nearestNearby`), Úloha 5 (`departMarketInPlace`, `TripBy`), `marketStance`, `fieldStoresOutlook`, `marketFreeAdults`; z `steward/steward-needs.ts` @ `b4f8dadc`: `grainStep`, `grainDealWith`, `grainPayment`, `constructionLogsLeft`, `FIT_TRIES`.
- Produces:

```ts
// VillageTrade.grainMisses?: { nearbyDay: number; villageIds: string[] } – vsi, odkud se správcova výprava za obilím vrátila bez obilí (platí jen se stejným nearby.day)
/** Cíl výpravy za obilím: nejbližší ves okolí mimo grainMisses (rotace, Rozhodnutí 8); všechny vyzkoušené → null. */
export function stewardGrainTarget(state: VillageState): NearbyVillage | null;
/** Krok 2a (mutuje): obilí v nouzi – chybí-li ≥ STEWARD.grainMinKg a nic správcovo není na cestě. Vrací, jestli vyrazil. */
export function stewardGrainStep(state: VillageState, ctx: NeedContext, shortKg: number): boolean;
/** 15. 11. (CRAFT_BUYING.day): výprava s nabídkou a sháňkou vsi (marketStance) do okolí[rok % počet]; shání-li ves něco. */
export function stewardMarketStep(state: VillageState, ctx: NeedContext): boolean;
```

- Obilí v nouzi: `wants.grain = shortKg`. `give` zbožím `STEWARD.grainPayment` v jeho pořadí do hodnoty obilí cenou cíle (Úloha 5 – cena ze zprávy, jinak výchozí), klády jen nad `constructionLogsLeft` (port i s komentářem). Nosiči nejvýš `max(1, floor(dospělí × grainPorterShare))` jako dřív: nevejde-li se výprava, správce zmenší nákup úměrně jako `grainDealWith`, nejvýš `FIT_TRIES = 4`× (technická mez, ne pravidlo – port i s komentářem). Cíl `stewardGrainTarget`, `departMarketInPlace(…, { by: 'steward' })`.
- Prázdný návrat: `applyMarketResult` u výpravy `by: 'steward'` s `trip.wants.grain > 0` a bez `bought.grain` přidá `trip.villageId` do `trade.grainMisses` (jiný `nearby.day` než v seznamu → seznam od začátku).
- „Nic správcovo není na cestě“ = žádná výprava `by: 'steward'` v `trade.expeditions`.
- Roční výprava `stewardMarketStep` je návrh Clauda (Rozhodnutí 8 – Martin 22. 11. 2026, pravidlo 9); komentář v kódu to řekne.
- `needSteps`: napřed `stewardGrainStep(targets.shortKg)`, pak lov jako dnes, pak `stewardMarketStep`.

- [ ] **Step 1: Testy:**
  - Zapnutý správce, okolí s M bez zprávy (výchozí ceny), `fieldStoresOutlook.shortKg` = 400, hřivny 5 kg, keramika 100 kg → výprava do M s `wants.grain = 400`, `give.ironBars = 5` (225 kg obilí) a `give.pottery` = 175 ÷ 3 ≈ 58,33 kg (do 400), uhlí ani klády ne. Druhý den správce nevyrazí (výprava na cestě).
  - Rotace: okolí [A, B] (A blíž); výsledek výpravy z A bez obilí → příští výprava do B; i z B bez obilí → správce nejede (`stewardGrainTarget` null), dokud nepřijde okolí s jiným `nearby.day` – pak zase A; úspěšný návrat z B → B zůstává cílem.
  - `shortKg` < `TRADE.porterKg` → nic. Bez okolí → nic. Vypnutý správce → nic.
  - 15. 11. roku 603 s okolím [A, B] (A blíž) → cíl B (603 % 2 = 1). Ves, která nic neshání → nic. `give` a `wants` = `marketStance` vsi téhož dne.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/steward packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow` (správce bez okolí beze změny – testy správce v pomalých).
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): správce jezdí na trh – obilí v nouzi a potřeba vsi (plán 3)`.

### Task 7: Kovář souseda ke koním (Opus)

**Files:**

- Create: `packages/game/src/domain/village/livestock/smith-visit.ts`
- Modify: `types/types-market.ts` (`SmithAsk`, `MarketArrival.service?`, `MarketVisitor.service?`, mail `smith-ask`), `types/types-people.ts` (`AwayKind` += `'craft'`), `types/types-state.ts` (`shoeing.asked?`), `types/types-chronicle.ts` (`horses-shod` `villageName?`, `villageId?`), `trade/market-trip.ts` (`MarketTripCheck.alone?`, volba `alone` v `planMarketTrip` a `departMarketInPlace`), `trade/market.ts` (`joinMarket` opíše `service` a volá `serveShoeing`; `marketDay` výpravy se `service` do zápočtu nepustí), `core/inbox.ts` (větev `smith-ask`), `core/simulate.ts` (`askSmithDay` za `finishShoeing`), `crafts/craft-buying.ts` (`paymentPool(…, intoBuffer = false)` z `b4f8dadc`)
- Modify: `docs/code/village-livestock.md` (Kování – kovář souseda), `docs/code/village-trade.md` (výprava kováře)
- Test: `livestock/__tests__/smith-visit.test.ts`, `trade/__tests__/market-trip.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearestWith`, `nearby.self`), Úloha 5 (`departMarketInPlace`, `TripBy`, `MarketVisitor.firstStep`), `planShoeing`, `shoeingDue` / `isUnshod`, `ridingHorses`, `shoeingBarsKg`, `ownCraftsmanWorks`, `occupiedWorkshops`, `rememberNews`, `OPPOSITE`, `TRADE_GOOD_VALUES`, `CARPENTRY.woodToolsManDaysPerKg`.
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
// VillageMail.body += { kind: 'smith-ask'; ask: SmithAsk }
// VillageState.shoeing.asked?: { key: string; villageId: string; name: string; untilDay: number }
// MarketArrival.service? / MarketVisitor.service?: { kind: 'shoeing'; horses: number }
// MarketTripCheck.alone?: true – kovář jde sám: porters 0, carts 0, bez kontroly dospělých, práce výpravy 0
// departMarketInPlace(…, options?: { by?: TripBy; alone?: true }), planMarketTrip(…, options?: { alone?: true })
export function smithFeeKg(horses: number, travelDays: number): number;
/** Ves s koňmi (mutuje): termín, vlastní kovář nemůže, dotaz nečeká → smith-ask vsi s kovářem (podle zprávy, rotace). */
export function askSmithDay(state: VillageState, day: number): void;
/** Ves kováře (inbox): může-li, kovář vyrazí (departMarketInPlace, by 'smith', alone, give.ironBars, service). */
export function answerSmithAsk(state: VillageState, day: number, ask: SmithAsk): ChronicleEvent[];
/** Ves s koňmi (joinMarket): okuje, zaplatí poplatek do visitor.bought, hřivny do visitor.sold. */
export function serveShoeing(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[];
```

- `smithFeeKg(h, t)` = (h × `HORSE_SHOEING.manDays` + 2 × t + `MARKET.minStayDays`) × den řemeslníka + h × `HORSE_SHOEING.ironBarsKg` × `TRADE_GOOD_VALUES.ironBars.valueKg`; den řemeslníka = `TRADE_GOOD_VALUES.woodTools.valueKg ÷ CARPENTRY.woodToolsManDaysPerKg` (= 4 kg, Rozhodnutí 9 – žádné nové číslo v `rules*.ts`). Dva koně u sousední mapy: (1 + 0 + 1) × 4 + 1 × 45 = 53 kg obilí.
- `askSmithDay`: jen s okolím, `shoeingDue` a `planShoeing` null. Cíl: bez `asked` `nearestWith(state, 'smith')`; s `asked` po `untilDay` (neúspěch) další ves okolí s kovářem podle zprávy za `asked.villageId` v pořadí `nearby.villages`, dokola (jediná → táž). Klíč `smith:<self>:<day>`, `ref` `<klíč>:ask`, den dotazu `day + 1 + marketTravelDays(cells)`, `asked = { key, villageId, name, untilDay }`, `untilDay` = den dotazu + 1 + `marketTravelDays(cells)` + `MARKET.minStayDays`. Kování (vlastní i cizí) `asked` smaže.
- `answerSmithAsk`: ves bez `nearby.self` nic. Kovář = muž domácnosti pracující kovárny (`ownCraftsmanWorks`), který není pryč. Hřivny ≥ koně × 0,5 + `shoeingBarsKg(vlastní)`. Výprava: cíl ze zprávy (`villageId = fromVillageId`, `firstStep = OPPOSITE[ask.firstStep]`), pobyt `MARKET.minStayDays`, `departMarketInPlace(…, { by: 'smith', alone: true })`. Kovář `away = { kind: 'craft', untilDay: returnDay }`. Zpráva o vsi, která se ptala, do `news` (`rememberNews`). Kronika výpravy `market-departed` `by: 'smith'`.
- `serveShoeing`: jen návštěvník se `service`. Ves má jezdecké koně a termín nastal: termín = dnešek, `asked` pryč, hřivny návštěvníka z `goods` do `sold` (spotřebované), poplatek `paymentPool(state, day, craftCoverage(state, day), true)` – obilí, pak luštěniny, nejvýš co pool má – ze vsi do `visitor.bought`. Kronika `horses-shod` `{ horses, own: false, direction: OPPOSITE[visitor.firstStep], villageName: visitor.fromName, villageId: visitor.fromVillageId }`. Jinak nic – hřivny zůstanou v `goods` a výsledek je vrátí jako `unsold`; výprava se `service` do zápočtu nevstupuje, takže je hostitel nekoupí.

- [ ] **Step 1: Testy** (dvě vsi A a K, přípravky `domain/village/__tests__/horse-fixtures.ts` + `trade/__tests__/market-fixtures.ts`):
  - `checkMarketTrip` s `alone: true` a `give: { ironBars: 1 }` projde i s `adults: 0` – `porters 0`, `carts 0`; bez `alone` `MARKET_NO_PEOPLE`.
  - A (2 jezdečtí koně po termínu, bez kováře, okolí K, zpráva K s kovářem) → `askSmithDay` dá v `outbox` jednu `smith-ask` (`horses: 2`, den D + 1); druhý den nic (`asked.untilDay` = D + 3).
  - K (kovář doma, hřivny 10 kg, bez jezdeckých koní) na `smith-ask` → výprava `by: 'smith'`, `porters 0`, `give.ironBars = 1`, kovář `away.kind = 'craft'` do `returnDay`, v `outbox` `market-arrive` se `service`.
  - A na příjezd → `shoeing.lastDay = den`, kronika `villageName: 'K…'`, ze vsi ubude 53 kg obilí (`storesKg`), `visitor.bought.grain = 53`, `visitor.sold.ironBars = 1`.
  - K po výsledku: obilí +53, hřivny −1, kovář doma v `untilDay`. V součtu obilí A + K a hřivny beze změny.
  - K bez hřiven, nebo kovář pryč → nic nevyrazí; A pošle nový dotaz až po `untilDay`. Rotace: okolí A má K1 i K2 s kovářem (zprávy), K1 neodpoví → po `untilDay` jde dotaz K2, po dalším neúspěchu zase K1.
  - A mezitím okoval vlastní kovář → `serveShoeing` nic, poplatek 0; A shání hřivny (vůz čeká na kování), přesto je tržní den nekoupí a K dostane hřivny zpět (`unsold.ironBars = 1`).
  - Kovárna K ve dnech, kdy je kovář pryč, nekuje (`restingCrafters` / práce dílny 0 – ověřit hodnotou z `workshopLabor`).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/livestock packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces; kovář pryč nesmí pracovat v dílně – ověř, že dílny berou `awayFromWork`, jinak doplň.
- [ ] **Step 4: Spustit** – PASS; `nice -n 19 npm run test:slow`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): kovář souseda přijde okovat koně (plán 3)`.

### Task 8: Lidé na trhu – výměna lidí a noví osadníci (Opus)

**Files:**

- Create: `packages/game/src/domain/village/trade/market-people.ts`
- Modify: `types/types-trade.ts` (`TradeGood` += `'families' | 'men' | 'women'`), `trade/goods.ts` (`PEOPLE_GOODS`, `isPeopleGood`, `PIECE_GOODS`), `rules/rules-trade.ts` (`families` `{ valueKg: 720, carryKg: 0 }`, `men` / `women` `{ valueKg: 360, carryKg: 0 }` – Rozhodnutí 4), `types/types-market.ts` (`MarketPerson`, `MarketArrival.people?`, `MarketVisitor.people?`, `boughtPeople?`, `MarketResult.people?`, `newcomers?`), `trade/trade.ts` (`villageGoodStock`, `addGood` pro lidi vyhodí chybu), `trade/market-trip.ts` (`planMarketTrip`, `departMarketInPlace`, `applyMarketResult`), `trade/market.ts` (`joinMarket` opíše `people`, `settleTrades`, `marketResult`), `trade/market-stance.ts`, `domain/vassalage/spare.ts` (export `peopleSpare`), `types/types-chronicle.ts` (`newcomer` `villageName?`, `villageId?`), `apps/web/lib/trade-names.ts` (ikony `family`, `man`, `woman`)
- Modify: `docs/code/village-trade.md` (Lidé – koho ves dá a kdo přijde → na trhu)
- Test: `trade/__tests__/market-people.test.ts`, `trade/__tests__/market-two-villages.test.ts`

**Interfaces:**

- Consumes: `emigrantGroups`, `emigrantList`, `removePeople`, `rehomePeople`, `newcomerHome`, `peopleSpare`, `stewardOutlook`, `MarketVisitor.firstStep` (Úloha 5), `OPPOSITE`.
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
- **Odjezd:** `give.men` atd. → `takePeople` (směr `target.firstStep`), skupiny do `MarketArrival.people`. `marketCrew` lidi nenese (jdou po svých), posádka aspoň 1 dál. `planMarketTrip` počítá volné dospělé nad mělkou kopií stavu bez lidí, které `takePeople` vezme (prvních n skupin podle `emigrantGroups`) – nosičem není nikdo z prodávaných.
- **Smyčky přes `TRADE_GOODS`** v `departMarketInPlace` (odchod), `settleTrades` (hostitel prodá / koupí) a `applyMarketResult` (`bought`, `unsold`) přeskočí lidi jako koně (`isPeopleGood`) – pohnou jimi `takePeople`, `settlePeople` a `restorePeople`. `addGood` pro lidi vyhodí chybu, takže zapomenutá smyčka spadne v testu.
- **Zápočet:** lidé jsou kusové zboží s cenou jako ostatní.
  - Hostitel prodá → `takePeople` z hostitele (směr `OPPOSITE[visitor.firstStep]`) do `boughtPeople` kupující výpravy.
  - Hostitel koupí → první skupiny druhu z `visitor.people` → `settlePeople(hostitel, …, { villageId: visitor.fromVillageId, villageName: visitor.fromName, direction: OPPOSITE[visitor.firstStep] })`.
  - Výprava od výpravy → skupiny přejdou do `boughtPeople` kupce.
- **Výsledek:** `people` = neprodané vlastní skupiny, `newcomers` = koupené. `applyMarketResult`: `restorePeople(people)`, `settlePeople(newcomers, { villageId: trip.villageId, villageName: trip.name, direction: výprava.direction })`. Výsledek `returned` (zaniklý hostitel) vrátí obojí stejně.
- **Stance:** `give` lidí = `peopleSpare(state, day, outlook)`, `want` = `peopleWanted`. Vesničané (Úloha 5) lidi nevozí.

- [ ] **Step 1: Testy** (`market-people.test.ts`):
  - `takePeople(s, D, 'families', 1, 'E')`: rodina (otec, matka, 2 děti) zmizí z `people`, v `emigrants` se směrem 'E'; `MarketPerson.people` má jejich původní id a vazby.
  - `settlePeople` do jiné vsi: 4 nové osoby s id od `nextId`, vazby matka–děti přepsané na nová id, vazby ven přerušené, `origin = 'W'`, jeden dům; kronika `newcomer` `villageName`, `villageId`.
  - `restorePeople` téže vsi: osoby s původními id, `emigrants` bez nich, `nextId` beze změny.
  - `peopleWanted`: `landHa` 12, `laborHa` 8, dospělí 10 → chybí 5 → rodiny 3.
  - `addGood(s, 'men', 1, D)` vyhodí chybu; `applyMarketResult` s lidmi v `bought`, `unsold`, `people` a `newcomers` nespadne a lidé jsou ve vsi.
  - Ves, jejíž 2 volní dospělí jsou jediná rodina na prodej, `give: { families: 1 }` → `MARKET_NO_PEOPLE` (nosič by byl prodávaný); s dalším volným dospělým projde s `porters 1`.
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
- Modify: `people/marriage.ts` (export `startMarriage`, `maxAgeGap` – `isSingle` a `dependants` už exportované; obnovit `favouredBride`, `crowded` a `perDay` z `b4f8dadc` beze změny), `people/dynasty-wives.ts` (export `wivesWho`; obnovit `wifeCounts`, `extraWifeHome` z `b4f8dadc`), `trade/people-trade.ts` (export `keptByLine`), `trade/market.ts` (`joinMarket` opíše `kin` a volá `receiveKin`), `trade/market-trip.ts` (`departMarketInPlace` – volby `kin`, `people`), `core/inbox.ts` (větev `kin-ask`), `core/simulate.ts` (`askKinDay` hned za `arrangeMarriages`), `application/nearby.ts` (`singles` u vsí okolí), `rules/rules-people.ts` (`MARRIAGE.neighbours`), `rules/rules-lord.ts` (`LORD.maxWives = 4`), `types/types-market.ts` (`NearbySingle`, `NearbyVillage.singles?`, `KinSeeker`, `KinAsk`, `MarketArrival.kin?`, `MarketVisitor.kin?`, mail `kin-ask`), `types/types-chronicle.ts` (`bride-from-outside`, `groom-from-outside`, `extra-wife`, `married-away` += `villageName?`, `villageId?`; `married-away` += `groom?: true`)
- Modify: `docs/code/village-people.md` (Sňatky – se sousedy; Manželky – další ze sousedních vsí), `docs/code/village-trade.md` (Okolí vsi – svobodní)
- Test: `people/__tests__/kin-match.test.ts`, `trade/__tests__/market-two-villages.test.ts`, `application/__tests__/nearby.test.ts`

**Interfaces:**

- Consumes: Úloha 1 (`nearby`, `nearbyVillages`), Úloha 5 (`departMarketInPlace`, `TripBy`, `MarketVisitor.firstStep`), Úloha 8 (`MarketPerson`, `settlePeople`), `removePeople`, `bestMatch`, `singles`, `parentIds`, `weddingChancePerDay`, `householdBreaksUp`, `keptByLine`, `awayFromWork`, `isDynastyTracked`, `rodBaptized`, `rememberNews`, `villageReport`, `OPPOSITE`; z `b4f8dadc`: `outsideMarriages`, `favouredBride`, `crowded`, `perDay` (`people/marriage.ts`), `extraWivesDay`, `extraWifeHome`, `wifeCounts` (`people/dynasty-wives.ts`).
- Produces:

```ts
/** Svobodný, který by šel za partnerem odjinud (kinCandidates) – pohlaví a věk po 5 letech (veřejná zpráva jako na pivu). */
export interface NearbySingle {
  sex: Sex;
  ageFrom: number; // 5 × floor(věk ÷ 5)
}
// NearbyVillage.singles?: NearbySingle[] – chybí = nic (okolí zapsané před Úlohou 9)
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
// VillageMail.body += { kind: 'kin-ask'; ask: KinAsk }
// MarketArrival.kin? / MarketVisitor.kin?: { seekerId: number; extraWife?: true } – joinMarket ho opíše
// departMarketInPlace(…, options?: { by?: TripBy; alone?: true; kin?: { seekerId: number; extraWife?: true }; people?: MarketPerson[] })
//   – příjezd nese kin a people (lidé už odebraní přes removePeople)
// rules-people.ts – MARRIAGE += neighbours (markets.md, Rozhodnutí plánu 3, body 11–12; čísla dřívějších
// sňatků z okolí a dalších manželek – b4f8dadc MARRIAGE.outside*, LORD.extraWife*, lord-history.md):
//   neighbours: { fromAge: 18, brideAge: { from: 16, to: 22 }, bridePerYear: 0.3, favouredGroomPerYear: 0.5, extraWifePerYear: 0.3 }
/** Kdo z vsi by šel za partnerem odjinud (Rozhodnutí 11 – Kdo přijde), v pořadí id. */
export function kinCandidates(state: VillageState, day: number): Person[];
/** Souhrn kinCandidates pro okolí (application/nearby.ts – den = lastDay vsi). */
export function kinSingles(state: VillageState, day: number): NearbySingle[];
/** Ves hledajícího (mutuje): kdo ve vsi nemá s kým, se s denní šancí zeptá vsi okolí s vhodným svobodným (proud 'kin:' + den). */
export function askKinDay(state: VillageState, day: number, storesFill: () => number): void;
/** Ves partnera (inbox, ráno před vlastními sňatky): vybere partnera z kinCandidates a pošle ho výpravou 'kin'. */
export function answerKinAsk(state: VillageState, day: number, ask: KinAsk): ChronicleEvent[];
/** Ves hledajícího (joinMarket): partner do vsi, svatba se svobodným hledajícím, jinak nováček. */
export function receiveKin(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[];
```

Pravidla (Rozhodnutí 11 a 12):

- **`kinCandidates`** – `isSingle`, doma (ne `awayFromWork`), muž od `fromAge`, bez `bestMatch` ve vsi, ne `keptByLine`, žena ne `favouredBride` (vdova, dědička ani žena z domu bez mužů se pryč nevdává), bez `dependants` (partner jde vždy sám), domácnost se odchodem nerozpadne (`householdBreaksUp` zbytku). `kinSingles` = `{ sex, ageFrom: 5 × floor(věk ÷ 5) }` každého z nich; `nearbyVillages` (Úloha 1) ho zapíše do `NearbyVillage.singles` ze stavu sousední vsi.
- **`askKinDay`** – jen s okolím, ne v hladu (`state.hungry`), za `arrangeMarriages` (kdo se dnes vzal, není svobodný; snoubenci čekající na zásoby mají `bestMatch`). Kandidáti v pořadí id, los na kandidáta z proudu `'kin:' + day` vždy (losy ostatních se nemění): ptá se, když los < `perDay(roční šance)`; pod pojistkou zásob (`storesFill() < 1`) navíc druhý los < `weddingChancePerDay(fill)` (čekání na zásoby jako svatba ve vsi). Kandidáti:
  - muž od `fromAge` bez `bestMatch` ve vsi, ne v přeplněném domě (`crowded`) → šance `perDay(bridePerYear)` a pod pojistkou zásob `weddingChancePerDay`,
  - žena od `fromAge`, `favouredBride`, bez `bestMatch` → `favouredGroomPerYear` (stejně); jiná svobodná žena se neptá nikdy,
  - muž rodu od `fromAge` s 1–3 žijícími manželkami (`wifeCounts`, < `LORD.maxWives`), ve vsi se sledovaným rodem (`isDynastyTracked`) a ne pokřtěném (`rodBaptized`), s domem (`extraWifeHome`) → `extraWifePerYear` (`extraWife: true`; přeplnění nevadí – lord.md).

  Cílová ves: další los vybere `floor(los × počet)` jen mezi vsemi okolí, jejichž `singles` mají vhodný protějšek – opačné pohlaví a pásmo `[ageFrom, ageFrom + 4]` se překrývá s `[věk − maxAgeGap(widowed), věk + maxAgeGap(widowed)]`, u další manželky žena s pásmem v 16–22. Žádná taková → dnes se neptá. Klíč `kin:<self>:<day>:<personId>`, den dotazu `day + 1 + marketTravelDays(cells)`, `ref` `<klíč>:ask`.

- **`answerKinAsk`** – ves bez `nearby.self` nic. Zprávu o hledající vsi do `news`. Kandidát z `kinCandidates`: opačné pohlaví, věkový rozdíl ≤ `maxAgeGap`, u `extraWife` žena 16–22 (`brideAge`), u ženicha ne muž rodu. Nejbližší věkem, při shodě nižší id. **Pořadí** (nikdo nesmí zmizet při odmítnuté výpravě):
  1. vybrat partnera,
  2. `planMarketTrip` nad mělkou kopií stavu bez něj (`{ ...state, people: bez partnera }`) – nosičem tak není on; odmítnutí → nikdo neodejde, nic se nezmění,
  3. `removePeople` (směr `OPPOSITE[ask.firstStep]`) – partner jako `MarketPerson` (`women` / `men`, jen on),
  4. `departMarketInPlace(…, { by: 'kin', kin: { seekerId, extraWife? }, people: [partner] })`: cíl hledající ves (`cells`, `firstStep = OPPOSITE[ask.firstStep]`), `give`/`wants` prázdné, pobyt `MARKET.minStayDays` – kontrola dá týž výsledek jako krok 2 (jinak chyba programu).

  Kronika `married-away` (`villageName`, `villageId`, u muže `groom: true`).

- **`receiveKin`** – `settlePeople` (nová id, `origin`):
  - hledající žije a je svobodný (u další manželky má < 4 žijící) → partner do jeho domu (u ženicha do domu ženy), `spouseId` jako svatba ve vsi (další manželka asymetricky – lord.md), `startMarriage` nevěstě,
  - jinak partner zůstane jako svobodný nováček v domě podle `newcomerHome`.

  Kronika `bride-from-outside` / `groom-from-outside` / `extra-wife` s `villageName`, `villageId`, jinak `newcomer`. `visitor.people` se vyprázdní – doprovod se vrátí s prázdným výsledkem.

- [ ] **Step 1: Testy** (`kin-match.test.ts`; den, kdy los padne, najde test smyčkou přes dny – deterministicky, ne pevným číslem z hlavy):
  - Ves bez okolí: za 3 roky žádný `kin-ask`, stav shodný s dopočtem bez kroku.
  - Svobodný muž 25 bez ženy ve vsi s okolím [B se svobodnou ženou 20 v `singles`] → v některý den `outbox` s `kin-ask` pro B, `seeker.sex = 'male'`; v hladu nikdy.
  - Los jen mezi vhodnými: okolí [B bez svobodných žen, C se ženou 20] → každý dotaz jde do C; okolí bez vhodné ženy → za 3 roky žádný dotaz.
  - „Jen se vdá pryč“: svobodná žena 20, která dům nedrží (doma muž od 16), za 3 roky `kin-ask` nepošle; vdova a dcera z domu bez mužů `kin-ask` pošlou (v některý den) a ženich přijde k nim (`groom-from-outside`); svobodná žena odejde z vsi jen po `kin-ask` muže odjinud – bez něj je za 3 roky pořád ve vsi a není v `emigrants`.
  - Snoubenci, kteří čekají na zásoby (`storesFill` < 1, svatba odložená), se neptají.
  - `kinSingles`: ves se svobodnou ženou 23, vdovou a mužem s nevěstou ve vsi → `[{ sex: 'female', ageFrom: 20 }]`.
  - `answerKinAsk` ve B se ženou 20 bez protějšku → výprava `by: 'kin'`, žena v `emigrants` se směrem, kronika `married-away` `villageName`; vdova neodejde nikdy (ani jako jediná žena); žena, které by se domácnost rozpadla, neodejde; manželka muže rodu ani muž rodu nikdy. Odmítnutá výprava (ves bez volného dospělého na doprovod) → žena zůstane v `people`, `emigrants` beze změny.
  - `receiveKin`: hledající svobodný → `spouseId` obou, `nextBirthFrom ≥ den + BIRTH_SPACING.afterWeddingDays`, kronika `bride-from-outside` `villageName: 'B…'`; hledající mezitím ženatý → nevěsta svobodná v domě `newcomerHome`, kronika `newcomer`; `nextId` vzroste přesně o počet příchozích.
  - Další manželka: muž rodu s 1 manželkou → druhá má `spouseId` = muž, muž ukazuje dál na hlavní; s 4 žijícími se neptá; pokřtěný rod se neptá.
  - Determinismus: A dopočtená přes 2 roky vcelku a po kouscích (rok + rok) dá shodný `outbox` i stav.
  - `application/__tests__/nearby.test.ts`: snímek okolí H (`nearbyVillages`) má u M `singles` = `kinSingles(stav M, lastDay M)` (ze souhrnu vsi M – Rozhodnutí 1).
- [ ] **Step 2: Test dvou vsí** („nevěsta ze sousední vsi“): A (muž bez ženy) a B (žena bez muže), oba s okolím. Kolo dotaz → výprava → příjezd → výsledek:
  - žena je v A vdaná, v B je v `emigrants`,
  - lidé A + B + na cestě jsou po každém kroku stejně (bez porodů a úmrtí v okně – kontrola kronikou),
  - doprovod je zpět v B v `returnDay`.
- [ ] **Step 3: Spustit** `npx vitest run packages/game/src/domain/village/people packages/game/src/domain/village/trade packages/game/src/application/__tests__/nearby.test.ts` – FAIL.
- [ ] **Step 4: Implementovat** podle Interfaces. Proud losu `'kin:' + day` je nový – jiné proudy se nesmí posunout.
- [ ] **Step 5: Spustit** – PASS; `nice -n 19 npm run test:slow` (zlaté otisky beze změny – vsi bez okolí).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(game): sňatky a další manželky se skutečnými sousedními vsemi (plán 3)`.

### Task 10: Pošta a svět – nové zprávy, zaniklé vsi, worker (Opus)

**Files:**

- Modify: `application/village-mail.ts` (krok 1 – zprávy bez nákladu do chybějící nebo spící vsi se zahodí, lidé z výsledku pro zaniklou domovskou ves jdou zpět hostiteli), `types/types-market.ts` (`MarketResult.origin?`, mail `people-back`), `trade/market.ts` (`departVisitors` – `origin` u výsledku s lidmi), `trade/market-people.ts` (`peopleBack`), `core/inbox.ts` (větev `people-back`), `application/__tests__/market-world.ts` (pomocníci: okolí obou vsí, svobodní, kovárna), `application/__tests__/village-mail.test.ts`, `application/__tests__/advance-world.test.ts`
- Modify: `docs/code/village-trade.md` (Pošta mezi vsemi – nové druhy, `people-back`), `docs/code/worker.md`
- Test: tytéž soubory, `trade/__tests__/market-people.test.ts`

**Interfaces:**

- Consumes: Úlohy 1, 4, 7, 8, 9 (`kin-ask`, `smith-ask`, `order-ready`, lidé ve výsledku, `restorePeople`, `settlePeople`), plán 2 `deliverVillageMail`, `overdueResult`, `VillageStamp.asleep`.
- Produces: `deliverVillageMail` beze změny podpisu.

```ts
// MarketResult.origin?: { villageId: string; villageName: string; direction: Direction8 } – výprava, jak ji viděl
//   hostitel (visitor.fromVillageId, fromName, OPPOSITE[visitor.firstStep]); departVisitors ho zapíše, nese-li výsledek lidi
// VillageMail.body += { kind: 'people-back'; key: string; people: MarketPerson[]; from: MarketResult['origin'] }
/** Hostitel (inbox): lidé z výsledku pro zaniklou domovskou ves – kdo je v emigrants (id a bornDay), se vrátí, ostatní se usadí. */
export function peopleBack(
  state: VillageState,
  day: number,
  back: { key: string; people: readonly MarketPerson[]; from: NonNullable<MarketResult['origin']> },
): ChronicleEvent[];
```

- Krok 1: cíl chybí, nebo spí (`stamp.asleep`) a zpráva je `kin-ask`, `smith-ask` nebo `order-ready` → zahodí se a smaže z `outbox`. `market-arrive` dál jako v plánu 2 – chybějící cíl → `returned`, spící cíl řeší výprava po termínu.
- Krok 1: `market-result` pro domovskou ves, která chybí nebo spí, nese-li lidi (`people`, `newcomers`) → do schránky vsi, jejíž `outbox` se doručuje (hostitel), jde `people-back` (`ref` `<ref výsledku>:back`, den = den výsledku, lidé z `people` i `newcomers`, `from` = `result.origin`); zboží výsledku se zahodí jako v plánu 2. Bez lidí beze změny.
- `peopleBack`: skupina, jejíž lidé jsou v `emigrants` vsi (týž id a `bornDay` – hostitel je prodal), → `restorePeople`; ostatní → `settlePeople(…, from)`. Kronika `newcomer` jen pro usazené.
- Lidé ve výsledku `returned` (Úloha 8) se vrátí přes `applyMarketResult` – bez nové větve.

- [ ] **Step 1: Testy:**
  - `market-people.test.ts` – `peopleBack`: hostitel M dostane zpět rodinu, kterou prodal (původní id, `emigrants` bez ní, `nextId` beze změny), a neprodaného muže z H usadí jako nováčka (`newcomer` `villageName: 'H…'`).
  - `village-mail.test.ts`:
    - `kin-ask` do spící vsi se nezapíše a zmizí z `outbox`,
    - H prodá rodinu M, M vymře před dnem příjezdu (příjezd je už ve schránce M) → `deliverVillageMail(H)` po termínu vrátí rodinu s původními id (H `people` obsahuje původní id, `emigrants` je nemají),
    - H koupí rodinu od M a H před návratem výsledku vymře (spí) / chybí → `deliverVillageMail(M)` zapíše M `people-back`, rodina je po dopočtu M zpět v M s původními id, nikdo nezmizel,
    - nevěsta z B na cestě do A, A smazaná (Začít znovu archivuje sídlo) → nevěsta zpět v B.
  - `advance-world.test.ts` (svět `marketWorld()` s okolím – `villages.withNearby`):
    - kola `advancePlayer` obou hráčů po zápisu `kin-ask` do schránky M dovedou nevěstu do H,
    - po každém kole je součet lidí H + M + v nákladu výprav (`outbox`, `market.visitors`, `inbox.pending`) stejný, kromě porodů a úmrtí z kroniky,
    - okolí se zapíše jen v pevné dny obnovy (`nearbyDays`), po kouscích i vcelku stejně.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** krok 1, `origin`, `people-back` (`peopleBack`, větev `applyEvent`) a pomocníky testů.
- [ ] **Step 4: Spustit** – PASS; `npm run test:db`.
- [ ] **Step 5: Mapa kódu**, kontroly, commit `feat(game): pošta plánu 3 – dotazy do zaniklých vsí, lidé na cestě se vracejí (plán 3)`.

> **Opravné kolo 1 (24. 11. 2026):** zpráva se jmenuje `stranded-people` (ne `people-back` – stejnojmenný druh kroniky), `peopleBack` je `receiveStranded`, `peopleBackMail` je `strandedMail`. Tělo nese `own` – skupiny, které prodal sám hostitel (`MarketPerson.fromHost` ze `settleTrades`); jen ty se vrátí s původními id, ostatní se usadí. Párování `soldHere` podle `emigrants` je pryč. Nově úloha světa `returnStrandedPeople` (port `VillageInbox.strandedResults` / `dropStranded`) pro domov, který zanikne s výsledkem ve schránce; krok 1 nevrací výsledek, který domov už použil. Rozhodnutí 1 a 13 upravená.

### Task 11: Web – kronika, upozornění, panely a e2e (Sonnet)

**Files:**

- Modify: `apps/web/lib/village.ts` (maskování jmen pro cizího správce při skládání pohledu), `apps/web/lib/village-view-chronicle.ts`, `village-notices.ts`, `horse-view.ts`, `village-view-crafts.ts`, `market-view.ts`, `apps/web/components/game/hud/MarketPanel.tsx`, `apps/web/e2e/market.spec.ts`, `packages/game/src/application/market.ts` (`collect` krok 4 – zprávy o ostatních vsích držitele cizímu správci vynechá)
- Modify: `docs/code/web-ui.md`
- Test: testy pohledů vedle souborů (`apps/web/lib/__tests__/…`), `packages/game/src/application/__tests__/market.test.ts`, `apps/web/e2e/market.spec.ts`

**Interfaces:**

- Consumes: kronika z Úloh 5–9 (`by`, `villageName`, `villageId`, `groom`, `order-ready`), `VillageState.orders`, `shoeing.asked` (`villageId`, `name`), `marketOverview` s `actorId` (plán 2 – množina vsí, které aktér smí vidět).
- Produces (jen pohled, žádná herní logika):
  - Kronika:
    - `market-departed` podle `by`: „Vesničané jeli na trh do Lhoty.“, „Správce poslal výpravu do Lhoty.“, „Kovář šel kovat koně do Lhoty.“; `kin` bez řádku – řekne to `married-away`,
    - „Nevěsta z Lhoty.“, „Ženich z Lhoty.“, „Dcera se vdala do Lhoty.“ / „Syn se přiženil do Lhoty.“, „Vojvoda <jméno> si vzal další manželku z Lhoty.“ (dosavadní text `extra-wife` + „z <ves>“), „Do vsi přišla rodina z Lhoty.“, „Kovář z Lhoty okul koně“ (Martin 14. 11. 2026), „Zakázka v Lhotě je hotová.“,
    - staré záznamy bez `villageName` beze změny.
  - Upozornění: dřívější „Nevěsta z okolí“, „Ženich z okolí“, „Dcera se vdala pryč“ se jménem vsi; kování koní bez upozornění (Martin 27. 10. a 9. 11. 2026).
  - Panel ohrady koní (Tooltip): „Kuje vlastní kovář“ / „Kovář z Lhoty“ (čeká dotaz – `shoeing.asked.name`, nebo poslední `horses-shod` s `own: false`) / „Kovář není“.
  - Řádek výrobků ve dvorci (Tooltip): „Nástroje – zakázka v Lhotě“, „… – hotová zakázka v Lhotě“; jinak jako dnes.
  - Panel Trh: nové zboží v „Dáš“ / „Dostaneš“ s ikonami a nejvýš `villageGoodStock`. Lidé ikonami `family`, `man`, `woman`. Voly pro koupený vůz spočítá server (`checkMarketTrip`), panel ukáže důvod `MARKET_NO_OXEN`.
  - **Cizí správce** (`actorId ≠ playerId`): `maskVillageNames` v `lib/village.ts` nad hotovým pohledem vsi na serveru – jméno záznamu kroniky, zakázky (`PlacedOrder`) a kování (`shoeing.asked`, `horses-shod`), jehož `villageId` není v `marketOverview` s `actorId`, nahradí prázdným jménem; texty pro prázdné jméno mluví o sousední vsi („do sousední vsi“, „ze sousední vsi“, „v sousední vsi“). Klient jména nedostane. V `collect` (`application/market.ts`) krok 4 pro správce vynechá zprávy o ostatních vsích držitele – výpravy vesničanů k nim jinak přinesou zprávu a jméno by se ukázalo v přehledu i v kronice (návrh Clauda, plán 2: „o ostatních vsích držitele … neví“).

- [ ] **Step 1: Testy pohledů:** pro každý nový text jeden případ se skutečným řetězcem. Starý `bride-from-outside` bez `villageName` → „Nevěsta z okolí“. Cizí správce: záznam s `villageId` vsi držitele → „Vesničané jeli na trh do sousední vsi.“, Tooltip zakázky → „Nástroje – zakázka v sousední vsi“, Tooltip koní → „Kovář ze sousední vsi“; vlastní hráč vidí „Lhoty“. Tooltip koní pro `shoeing.asked` → „Kovář z Lhoty“. `market.test.ts`: zpráva o druhé vsi držitele v `news` – držitel ji v přehledu vidí, cizí správce ne.
- [ ] **Step 2: Spustit** `npx vitest run apps/web packages/game/src/application/__tests__/market.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** pohledy, maskování a panel.
- [ ] **Step 4: Spustit** – PASS.
- [ ] **Step 5: E2e:** `market.spec.ts` – panel Trh ukáže nástroje a muže v „Dáš“ (dev ves s nástroji nad potřebou a volným mužem), odeslání projde a kronika ukáže „Výprava…“. Spustit sériově `npm run test:e2e -- market.spec.ts` (předtím `pgrep -f "[p]laywright test"` prázdné).
- [ ] **Step 6: Mapa kódu**, kontroly, commit `feat(web): kronika, panely a trh pro vesničany, kováře, lidi a sňatky (plán 3)`.

### Task 12: Návrhy, celé e2e a ověření dvou vsí (Sonnet)

**Files:**

- Create: `packages/game/src/domain/village/trade/__tests__/market-neighbours-years.test.ts` (pomalý – zapsat do `packages/game/slow-tests.ts`)
- Modify:
  - `docs/design/markets.md` – oddíl „Rozhodnutí plánu 3 (návrh Clauda, 24. 11. 2026)“: Martinova rozhodnutí k plánu 3 doslova, body 1–16 tohoto plánu zkráceně, čísla (i cena rodiny bez ohledu na počet dětí); stav „Plán 3 hotový“; Co se ověří – výsledek testu,
  - `neighbours.md` – body 6–8 hotové; Pravidla 6 – odchylka „zakázka se zapíše při odjezdu výpravy, platí se při vyzvednutí“ s důvodem (zápočet bez mincí nezná dluh ani platbu předem – Rozhodnutí 6); Pravidla 1 – „ne rodu ve válce“ sjednotit s plánem 2, Rozhodnutí 1 (válka nevadí),
  - `kinship.md` (Sňatky – se skutečnými sousedy, „Jen se vdá pryč“), `lord.md` (Manželky – Další manželky ze sousedních vsí; banner nahoře), `history/lord-history.md` (poznámka, že pravidlo se vrátilo se skutečnými vsemi),
  - `horses.md` (Kování – kovář souseda, poplatek: den řemeslníka 4 kg místo ceny jídla v práci vsi), `wagons.md` (Kování vozů – tesař pro hřivny na trh), `crafts.md` (Nákup na trhu, Zakázky, obilí za výrobky vždy), `steward.md` (Správce na trhu, rotace cílů, roční výprava jako návrh Clauda), `trade.md` (Výměna lidí → trh),
  - `CLAUDE.md` (řádek `village-trade.md` v tabulce mapy kódu – okolí, zakázky, lidé)

- [ ] **Step 1: Pomalý test dvou vsí** (`market-neighbours-years.test.ts`, markets.md – Co se ověří): ves R (kovář, hrnčíř, tesař, obilí nad pojistkou – neshání ho) a ves S (bez řemeslníků), obě s okolím. Na sousedních mapách 3 roky po dnech, pošta mezi nimi po každém dni jako události schránky (vzor `market-two-villages.test.ts`). Kontrolní běh S bez okolí ve stejném testu. Tvrdí:
  - vybavení nástroji S na konci je větší než v kontrolním běhu a aspoň jednou v běhu vzroste nákupem (řemeslník bere obilí vždy – Martin 24. 11. 2026),
  - `stewardOutlook(S).laborHa` na konci ≥ kontrolní běh (pole se po plánu 1 vracejí – Rozhodnutí plánu 1, bod 8),
  - lidé R + S + na cestě = začátek + porody − úmrtí (z kroniky); id odešlého (v `emigrants` své vsi) není zároveň v `people` téže vsi, kromě vrácených (`restorePeople` je z `emigrants` odebere),
  - žádné `NaN` v zásobách, hladem nikdo,
  - aspoň jedna výprava `by: 'villagers'`, každá s výsledkem.

  Do zprávy (bez prahu): vybavení S na začátku, na konci a v kontrolním běhu, `laborHa` obou běhů, počet sňatků se sousedy a dalších manželek.

- [ ] **Step 2: Spustit** `nice -n 19 npm run test:slow` – PASS (selže-li podmínka, nehrát si s čísly – zapsat do zprávy a ozvat se).
- [ ] **Step 3: Návrhy** podle Files – Martinova slova s datem, vlastní rozhodnutí „návrh Clauda“; `grep -rn "koordin\|za Martina" docs/design` nic.
- [ ] **Step 4: Celé e2e** sériově `npm run test:e2e` (předtím `pgrep -f "[p]laywright test"` prázdné), pak kontroly z Global Constraints a `npm run test:db`.
- [ ] **Step 5: Commit** `docs: obchod 3 – vesničané a správce na trhu, zakázky, lidé a sňatky se sousedy (plán 3)`.

## Oznámit Martinovi (návrhy Clauda, které vracejí nebo mění pravidla)

1. Další manželky mužů rodu se vracejí ze skutečných sousedních vsí (Rozhodnutí 12) – plán 1, Rozhodnutí 6 je nevracel.
2. Správce jednou ročně 15. 11. jede na trh s tím, co ves nabízí a shání (Rozhodnutí 8).
3. Zakázka se zapíše při odjezdu výpravy, platí se při vyzvednutí – odchylka od neighbours.md, Pravidla 6 (Rozhodnutí 6).
4. Poplatek kováře souseda počítá den řemeslníka 4 kg obilí místo ceny jídla v práci vsi (Rozhodnutí 9).
5. Lidé z výsledku pro zaniklou domovskou ves zůstanou u hostitele – prodaní se mu vrátí, ostatní se u něj usadí (Rozhodnutí 13).
