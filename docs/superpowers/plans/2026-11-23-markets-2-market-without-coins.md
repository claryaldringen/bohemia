# Obchod 2 – trh bez mincí – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráč pošle obchodní výpravu do známé skutečné vsi (co prodat, co nakoupit, jak dlouho zůstane). V hostitelské vsi drží trh její stav: nabídku tvoří přebytek vsi podle výpočtu potřeby a zboží přítomných výprav. Ceny v mincovní míře se po tržních dnech posouvají a platí se zápočtem. Výsledek jde výpravě schránkou domů a hráč má přehled vsí se zprávou „na pivo“ (issue #11, plán 2 ze 6).

**Architecture:**

- Výprava stojí na **karavaně a schránce vsi**: nový druh `TradeExpedition.kind = 'market'`. Výprava po taktech (`JourneyState`) to není – srovnání je v Rozhodnutí 1.
- **Trh je část stavu hostitelské vsi** (`VillageState.market`):
  - příjezd výpravy = událost schránky `market-arrive`,
  - tržní den = krok dne hned po událostech schránky (`marketDay`),
  - odjezd = zpráva `market-result` v **odchozí schránce vsi** (`VillageState.outbox`).
- Odchozí schránku po dopočtu doručí `deliverVillageMail` (worker i web) do schránky domovské vsi – idempotentně podle `ref`. Zaniklého hostitele vyřeší domovská ves.
- **Cena a zápočet** jsou čisté funkce (`market-prices.ts`, `market-clearing.ts`). Co ves nabízí a shání, počítá `marketStance` z výhledu dávek. Zprávu na pivo skládá `villageReport`. Výpravu doma obstarají `departMarket` a `applyMarketResult`.
- Přehled vsí a odeslání výpravy jsou use-casy (`application/market.ts`), ve webu je panel Trh ve dvorci.

**Tech Stack:** TypeScript 6 (strict), `packages/game` (doména, use-casy, Vitest), `packages/server`, `apps/web` (Next.js 16, React 19), Playwright (projekty chromium a worker).

**Spec:**

- `docs/design/markets.md` – závazný (schváleno Martinem 22. 11. 2026): Martinova rozhodnutí, Pravidla 2, 3, 4 (bez mincí jako zboží), 5 a 8, Co se ověří bod 2 bez kupců, Nechává se na stavitele.
- `docs/design/neighbours.md` – Martinova rozhodnutí (Sousedé i vsi jiných hráčů, Řemeslníci souseda), Pravidla 1 (kdo je soused).
- Plán 1 `docs/superpowers/plans/2026-11-23-markets-1-real-neighbours.md` – Rozhodnutí 1 (co se vrátí v plánu 2), Global Constraints.
- Mapa kódu: `docs/code/vassalage.md` (Výhled vsi, Zásilky mezi vsemi hráčů), `world.md` (Schránka vsi, Adresář rodů), `village-trade.md` (karavana, zásilky), `journey.md` (Stav a krok, Znalost rodu, Známá mapa), `village-core.md` (Pořadí práce dne, Schránka vsi, Dopočet, Bez čísla verze stavu, Uložení stavu vsi), `worker.md` (Spící vsi, Dotyky), `web-ui.md`.

## Global Constraints

- **Předpoklad:** plán 1 je sloučený ve `feat/landscape`. Musí platit: `trade/goods.ts`, `VillageTrade = { expeditions; nextId }`, `legacyNeighbourName`, není `sendExpedition`, `tradeQuote`, `TradePanel` ani `trade-quote.ts`. Jinak Úlohu 1 nezačínat a ozvat se. Práce běží ve větvi `feat/markets-2` z `feat/landscape`. Kód smazaný plánem 1 je k nahlédnutí v `b4f8dadc` (`git show b4f8dadc:<cesta>`).
- **Martin, 22. 11. 2026:**
  - „Obojí ve vsi bude prostě přechodně víc nějakého zboží … napřed pro uspokojení poptávky použijí krávy z vesnice B a pak až z vesnice A. Samozřejmě z vesnice B se použije jen tolik krav, kolik jich chce vesnice skutečně prodat.“
  - „Výprava bude mít určeno, jak dlouho na místě zůstane. Po tu dobu bude samozřejmě pracovní síla chybět ve zdrojové vsi … ráno se vyrazí a večer vrátí … Vše ale závisí na hráči. Co se neprodá, berou si obchodníci zpátky domů.“
  - Zápočet: „ANo, přesně tak“. Hostitelská ves podle výpočtu potřeby: „ano“. Výprava jen se seznamem za cenu toho dne: „ok“.
- **Mimo plán 2:**
  - mince jako zboží a kupci – plán 4,
  - vesničané a správce na trhu, zakázky řemeslníků, lidé a sňatky – plán 3. Lidé na trh nejdou.
  - Výpravu sestaví jen hráč.
- **Žádná pravidla navíc:** žádné cenové meze, minimální zásoby, strop pobytu ani počtu výprav, opakované výpravy ani automatika za hráče. Strop kol zápočtu je technická mez algoritmu, ne pravidlo. Stejně `MARKET.report.traders` (Rozhodnutí 7) – technický strop paměti vsi, ne pravidlo hry.
- **Řemeslníkovi je jedno, kdo mu platí** (Martin, neighbours.md): trh nerozlišuje, kdo kupuje.
- **Hexagon:** doména a use-casy bez infrastruktury. Web i worker volají stejné use-casy a server je jediná autorita.
- **Determinismus:**
  - Trh hostitele počítá jen ze stavu hostitele a událostí schránky toho dne. Dopočet po kouscích musí dát stejný výsledek jako vcelku.
  - Bez `Math.random`, `Date.now()` a `new Date()`.
  - Vsi se dopočítávají zvlášť. Výsledek proto jde schránkou a padne na svůj den, nebo na nejbližší nespočtený den domovské vsi (village-core.md – Schránka vsi). Je to stejné jako u zásilek.
- **Čísla pravidel** jsou jen v novém `rules/rules-market.ts` (`MARKET`) s odkazem „markets.md – Rozhodnutí plánu 2“. Do textu návrhu je zapíše Úloha 9.
- **Stav vsi:**
  - Nové části jsou volitelné: `market`, `outbox`, `news`, `TradeExpedition.market`, druh `'market'`. Do stavu se zapíšou až při prvním použití (village-core.md – Bez čísla verze stavu).
  - Chybějící část znamená prázdnou, převod tedy není potřeba a `VILLAGE_MIGRATIONS` zůstává beze změny.
  - Kodek se nemění, nové klíče jdou do „dne“. DB migrace není.
- **Zlaté otisky se nesmí změnit:** ves bez výprav na trh a bez návštěv simuluje stejně. Selže-li `*golden*.test.ts`, je to chyba úlohy, ne nový otisk.
- **Rozhraní jako v 0 A.D.:** ikony a čísla, slova jen v `Tooltip`. Výjimkou jsou hlavičky „Dáš“ / „Dostaneš“.
- **Kontroly na konci každé úlohy:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:docs` a `nice -n 19 npm run test`.
  - Úlohy 3 a 4 navíc `nice -n 19 npm run test:slow`.
  - Úloha 5 navíc `npm run test:db`.
  - E2e pouštět jen tam, kde to úloha říká, a sériově: `pgrep -f "[p]laywright test"` předtím nesmí nic vrátit.
- **`docs/code/`:** úloha, která přidá nebo přejmenuje jméno, opraví v téže úloze mapu kódu (jinak padne `check:docs`). Návrhy v `docs/design/` až v Úloze 9.
- **Jazyk a zápis:** česky komentáře i docs, krátká pomlčka „–“. Vlastní rozhodnutí jsou „návrh Clauda“, Martinova slova s datem. Commity Conventional Commits česky, `Refs #11`, na konci `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agenti:** žádní subagenti, žádné `sleep` v popředí, `pkill`, `rm -rf`, `git stash` ani `git branch -D`. Neslučovat, nepushovat. Nejvýš ≈ 150 kroků na úlohu. DB `bohemia` jen ke čtení.

## Rozhodnutí plánu (návrh Clauda)

1. **Výprava stojí na karavaně a schránce vsi, ne na výpravě po taktech.** Pravidlo 2 („k blízké vsi ráno tam a večer zpět, do vzdálenější přes víc map“) splní jen karavana:

   |            | Karavana a schránka vsi (zvoleno)                                                                                      | Výprava po taktech (`JourneyState`)                                                                                         |
   | ---------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
   | Čas        | herní dny, délku cesty dává pravidlo – k sousední vsi je výprava pryč jen den trhu                                     | skutečný čas po taktech: 1 km po louce ≈ 286 s ≈ 3,3 herního dne (war.md – Tempo), k sousední vsi (2–4 km) týden až dva tam |
   | Náklad     | hotové: `give`, nosiči, honáci, vozy se spřežením, práce `expeditionLaborToday`, karavana ve scéně (`caravan-view.ts`) | nese jen lidi rodu a koně (`JourneyMember`) – zboží, dobytek, vozy a nosiče by bylo nutné přidat do kontrolních bodů        |
   | Mezi vsemi | schránka vsi (idempotentní `ref`, den použití) – zásilky po ní už vozí zboží mezi skutečnými vsemi                     | worker výprav, bariéra vsí – výměna zboží s cizí vsí uprostřed taktu by byla nová                                           |
   | Kdo        | hráč, v plánu 3 správce a vesničané – táž funkce                                                                       | vede vojvoda nebo muž rodu, vesničané ne                                                                                    |
   | Cena       | nový druh výpravy, dvě události schránky, krok trhu, odchozí schránka                                                  | navíc víc práce než celý plán 2                                                                                             |

   Zásilky samotné (`dispatchShipment`, tabulka `shipment`) nesou **makrokomodity** a v cílové vsi je přidávají do zásob. Výprava na trh potřebuje všech 19 druhů zboží, pobyt a návrat, proto má vlastní druh výpravy a vlastní události. Ze zásilek přebírá `settlementCell`, `stepToward`, `sleeps`, `crossesIsolation` a výpočet `placeOf` (`application/shipments.ts`, exportují se beze změny chování) a karavanu ve scéně.

2. **Doba cesty** (Martin: „ráno se vyrazí a večer vrátí“):
   - Výprava vyrazí ráno dne po odeslání: `departDay = today + 1`. Dnešek hráčovy vsi je totiž už spočtený.
   - Cesta tam trvá `marketTravelDays(cells) = max(0, cells − MARKET.dayTripCells) × MARKET.daysPerCell`, kde `dayTripCells = 1` a `daysPerCell = 1`.
     - Ves na sousední mapě (i úhlopříčně, ≈ 2–4 km) = ráno tam, večer zpět. Pryč jsou jen dny pobytu.
     - Každá další mapa přidá den tam a den zpět („do vzdálenější přes víc map“).
     - Zásilky jezdí 2 dny na políčko. Na trh by to dalo k sousední vsi 4 dny, což Martinovo „ráno tam, večer zpět“ nesplní.
   - Data cesty:
     - `arriveDay = departDay + travel`,
     - tržní dny `arriveDay … arriveDay + stay − 1`,
     - `returnDay = arriveDay + stay + travel` je první den doma.
   - Lidé (práce nosičů) a vozy se spřežením chybí doma ve dnech `departDay … returnDay − 1`, i kdyby ves měla málo dospělých. Termín trhu je pevný. Pobyt je celý počet dní, nejméně `MARKET.minStayDays = 1`.
   - Výprava na trh nemá stezku (`trailId` −1, jako zásilka) a jezdec vojvody ji nedoprovází (`lordRides` – `escort` jen u výpravy k sousedovi po stezce). Doprovod (horses.md – Doprovod výpravy, návrh Clauda „jen ve scéně“) jede po stezce výpravy, kterou výprava na trh nemá. Jezdec v doprovodu navíc chybí v hlídce polí (`riderPatrol`), takže by doprovod bez Martinova pokynu měnil škody zvěře na polích (Úloha 4).

3. **Model ceny** – markets.md, Pravidla 4; Nechává se na stavitele „o kolik se posune, meze“:
   - Cena je v mincích za kg, kus nebo m³. Výchozí cena je `TRADE_GOOD_VALUES[g].valueKg / MARKET.grainKgPerCoin` s kurzem 15 kg obilí za minci. Podklad z rešerše `research/2026-10-18-trade-values.md`: Frankfurt 794 – žito 3 denáry za modius ≈ 37–49 kg, tedy ≈ 12–16 kg za denár; Ibráhím ibn Jákúb – za minci jídlo na měsíc.
   - Po každém tržním dni: `P' = P × (1 + MARKET.priceStep × (D − S) / (D + S))` s `priceStep = 0,1`.
     - D je, kolik se zboží ten den žádalo (součet seznamů stran), S kolik se ho nabízelo (součet nabídek).
     - Za den se cena pohne nejvýš o ±10 % a nikdy neklesne na nulu. Jiné meze nejsou.
     - Zboží bez nabídky i poptávky cenu nemění.
   - Trh si pamatuje cenu každého zboží, které na něm bylo (`market.prices`), ostatní mají výchozí.
   - Zlý rok kraje se v ceně projeví sám: víc vsí shání obilí a míň ho nabízí. Pevné zdražení se nepřidává (plán 1, Rozhodnutí 1).

4. **Zápočet** (Pravidla 5) **je vyrovnaný barter v mincovní míře každý tržní den.**
   - Každá strana (hostitel, výpravy) za den prodá přesně za tolik, za kolik koupí. Strana bez protějšku nic neprodá ani nekoupí.
   - Dluh ani přeplatek nevzniká, a proto se nic nepřenáší do dalšího dne. Kus (kráva, kůň, kláda, kůže, m³ kamene) se prodá jen tehdy, když ho hodnotou vyrovná kg zboží nebo jiné kusy. Kg zboží se dělí libovolně.
   - Prodávající v pořadí: hostitel, pak výpravy podle příjezdu (Martin). Kupující v témže pořadí.
   - Algoritmus je v Úloze 1.
   - Bez mincí je to obchod „za zboží“. Hostitel bez potřeby proto nic neprodá a výprava prodá jen za to, co má na seznamu. Do mincí (plán 4) bude trh řídký.

5. **Co hostitelská ves nabízí a shání** (Pravidla 3: „přebytek nad vlastní potřebou podle výpočtu potřeby jako u dávek“). Výpočet potřeby, který mají dávky (`villageSpare`), existuje jen pro makrokomodity. Hostitel proto obchoduje jen s nimi:

   | Zboží                          | Nabízí                                                                                                             | Shání                                                                                           |
   | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
   | obilí                          | `grainSpareKg(state, day, outlook)` = `villageSpare(…).grainKg` (nad pojistku `VASSALAGE.reserveYears`, v hladu 0) | `grainReserveKg(state, day, outlook) − grainOnHandKg(state)`, je-li kladné                      |
   | krávy                          | `cattleSpare(…).cows` (`surplusCows`)                                                                              | `breedingCows + oxenCalvesWanted − krávy`, je-li kladné, celé kusy nahoru                       |
   | mladí a vycvičení voli         | `cattleSpare` (napřed mladí)                                                                                       | vycvičení voli `oxenTrainingTarget − voli v ohradách (i ve výcviku) − oxenComing`, je-li kladné |
   | hříbata, klisny, jezdečtí koně | `min(horsesForSale(state, g, day), horsesOf(state, g, day) − chce)`, je-li kladné                                  | `chce − horsesOf(state, g, day)`, je-li kladné                                                  |
   | klády, kámen                   | celá hromada (jako výhled dávek – „pojistka na ně není“)                                                           | nic                                                                                             |
   | ostatní zboží                  | nic                                                                                                                | nic                                                                                             |
   - `outlook = stewardOutlook(state, day, craftCoverage(state, day))` jako ve `villageSpare` (pojistka obilí obsahuje osivo na osev, který ves zvládne).
   - Koně: `chce` je `horsesWanted(state, day)` po druzích – `foals` → `foals`, `mares` → `mares`, `ridingHorses` → `riding`. `horsesOf(state, g, day)` (nová, Úloha 2) počítá koně druhu v ohradách i pod jezdcem, druh podle věku a pohlaví jako `horsesForSale`.

   Nabídka je nejvýš `villageGoodStock`. Ostatní zboží (jídlo, výrobky, hřivny, med, kůže…) se v plánu 2 vyměňuje jen mezi výpravami. Řemeslné výrobky a jídlo do potřeby vsi přidá plán 3 (vesničané a řemeslníci na trhu).

6. **Oběh mezi vsemi** (Nechává se na stavitele):
   - Ves sbírá zprávy pro jiné vsi do **odchozí schránky** `VillageState.outbox: VillageMail[]` (`{ villageId, day, ref, body }`). Zprávou je příjezd výpravy a výsledek trhu.
   - `deliverVillageMail` je zapíše do schránek cílových vsí (`inbox.post`; druhý zápis téhož `ref` se zahodí) a doručené smaže (`villages.save` s verzí, opakování při souběhu).
   - Volá se po dopočtu tam, kde dnes vybavení odchodů správce (`advancePlayer`, `dynasty-for-village`, `advance-dynasty`), a po odeslání výpravy. Worker doručí i ves, kterou už dopočítal web a kterou proto nedopočítává (`stamp.lastDay >= to`). Pád mezi uložením a zápisem tak doručí příští kolo workeru.
   - **Výprava po termínu** (`lastDay ≥ returnDay`, výsledek nepřišel): domovská ves se podívá na hostitele.
     - Výsledek v jeho odchozí schránce doručí sama.
     - Když hostitel zanikl (vymřel, opuštěn, sídlo archivované nebo ves chybí):
       - nepoužitý příjezd se vrátí jako výsledek se vším, co výprava vezla (`returned`),
       - výprava, která už na trhu stojí, se vrátí s tím, co drží.
     - Živý hostitel pozadu znamená čekat. Lidé jsou doma v plánovaný den, zboží přijde se zprávou.
   - Klíč výpravy je `market:<domovská ves>:<id výpravy>`, `ref` příjezdu `…:in`, výsledku `…:out`.

7. **Přehled vsí a zpráva na pivo** (Pravidla 8):
   - **Známé vsi:**
     - vsi vlastního rodu,
     - vsi na 8 sousedních mapách (neighbours.md – Pravidla 1: soused je ves na sousední mapě, i jiného hráče – Martin),
     - vsi na mapách, které rod zná z výjezdů a tažení (`knowledge.knownCellsOf`, rod viděl aspoň jednu stavbu),
     - vsi, o kterých má ves zprávu (`news`).
   - **Kdo v přehledu není nebo je zašedlý:**
     - Odříznutý rod vidí jen své vsi (`crossesIsolation`).
     - Vsi zaniklé jsou v přehledu zašedlé s důvodem a výprava tam nejede. Válka obchod nezakazuje – Martin to nežádal
       (návrh Clauda 23. 11. 2026: pravidlo navíc z podkladu neighbours.md – Pravidla 1 se nezavádí).
   - **Vzdálenost** = políčka (`cellDistance`) a dny cesty `marketTravelDays`.
   - **Zpráva na pivo** (`villageReport`): lidé a domy zaokrouhleně (`MARKET.report.round = 5`, nejméně 5, je-li aspoň jeden), řemesla s pracujícím řemeslníkem a posledních `MARKET.report.traders = 10` obchodníků. U každého obchodníka je, odkud přišel, kdy a s jakým zbožím (issue #11: „kdy tam kdo přijel s čím obchodovat“).
   - **`MARKET.report.traders = 10` je technický strop, ne pravidlo hry** (návrh Clauda): hostitel si pamatuje jen posledních 10 příjezdů (`market.arrivals`), aby stav vsi nerostl donekonečna. Hráč proto ve zprávě uvidí nejvýš 10 posledních obchodníků.
   - **Odkud zpráva přijde:**
     - Domů ji přinese výprava se svým výsledkem, i s cenami trhu toho dne.
     - Hostitel ji dostane od každé výpravy, která k němu přijde („obchodník, který přijel k nám“).
     - Z výjezdů a tažení jsou jen domy a řemesla, jak je muži viděli (`SeenDwelling.craft`).
   - **„Stárne s časem“:** u zprávy se ukáže její stáří. Mizení podle času se nepřidává (jen strop 10 obchodníků výš).
   - Výprava „jen na pivo“ bez zboží je dovolená.

8. **Převod stavu:** žádný (Global Constraints).
9. **Rozhraní:**
   - Tlačítko Obchod ve dvorci se vrací (`icons/build/obchod.png`) a otevře panel Trh.
   - Panel Trh má tyto části:
     - přehled vsí,
     - zpráva vybrané vsi,
     - sestavení výpravy (sloupce „Dáš“ / „Dostaneš“, dny na trhu, náhled nosičů, vozů a dní pryč, odeslat),
     - výpravy na cestě.
   - Karavana ve scéně jde jako zásilka (ke kraji mapy ve směru `destination.firstStep`), ve dnech pobytu stojí za krajem mapy. Kronika a upozornění mají čtyři nové záznamy.
10. **Co se z plánu 1 vrací:**
    - Obchodní výprava hráče se vrací jako výprava na trh, bez lidí – výměna lidí je v plánu 3.
    - Hřivny jsou zboží trhu.
    - Zlý rok kraje se projeví v cenách (bod 3).
    - Právo `trade` dostane akce `sendMarketExpedition`.
11. **Pořadí úloh:**
    - 1–2 jsou čisté funkce. Úloha 2 doplňuje soubory, které založí Úloha 1, takže jdou po sobě.
    - 3 je trh u hostitele, 4 výprava doma s testem dvou vsí.
    - 5 je doručení a zaniklý hostitel, 6 use-casy.
    - 7–8 je web, 9 návrhy a celé e2e.

## Review Focus

1. **Hostitelská ves zanikne nebo zmizí před příjezdem výpravy nebo během pobytu** (vymře, opustí se, Začít znovu archivuje sídlo):
   - výprava se vrátí s tím, co v tu chvíli drží, před příjezdem se vším,
   - nic nezmizí ani se nezdvojí.

   Test v Úloze 5.

2. **Výsledek trhu přijde pozdě, nebo by přišel dvakrát** (hostitel pozadu nebo spí, pád mezi zápisem do schránky a uložením, souběh webu a workeru):
   - zboží přibude doma právě jednou,
   - lidé a vozy jsou doma v plánovaný den.

   Test v Úloze 5.

3. **Strana trhu bez protějšku** (přivezené zboží nikdo nechce, sháněné nikdo nemá, hostitel bez přebytku nebo v hladu, výprava „na pivo“ bez zboží):
   - nic neprodá ani nekoupí, vrátí se se vším a se zprávou,
   - nechtěné zboží zlevní, sháněné zdraží.

   Test v Úlohách 1 a 3.

4. **Kus za hodnotu, která nevychází na celé kusy** (kráva, kůň, kláda, kůže proti kg zboží nebo jinému kusu):
   - nikdo nedostane nic zadarmo ani nepřeplatí,
   - rozdíl dorovná kg zboží, jinak se kus neprodá.

   Test v Úloze 1.

5. **Výprava, kterou ves nemá čím obsadit nebo uvézt** (málo dospělých, kámen bez vozu, víc zboží, než ves smí prodat – chovné krávy, koně pod jezdci):
   - server i náhled v panelu odmítnou s týmž důvodem (obojí volá `checkMarketTrip`),
   - nic neodejde.

   Test v Úlohách 4 a 7.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                                                      | Co                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1     | `types/types-market.ts` (nový), `rules/rules-market.ts` (nový), `trade/market-prices.ts`, `trade/market-clearing.ts`, `trade/goods.ts` (`PIECE_GOODS`)                                                                                                       | ceny a zápočet                                   |
| 2     | `trade/market-stance.ts`, `trade/village-report.ts`, `domain/vassalage/spare.ts` (`grainReserveKg`), `trade/horse-trade.ts` (`horsesOf`), `types/types-market.ts`, `types/types-state.ts` (`market?`)                                                        | co ves nabízí a shání, zpráva na pivo, typy trhu |
| 3     | `trade/market.ts`, `trade/horse-trade.ts` (`takeHorses`), `core/inbox.ts`, `core/simulate.ts`, `types/types-state.ts`, `types/types-chronicle.ts`, `domain/vassalage/shipment.ts`, `apps/web/lib/village-view-chronicle.ts`                                  | trh u hostitele                                  |
| 4     | `trade/market-trip.ts`, `trade/trade.ts`, `core/simulate-work-apply.ts`, `people/lord.ts` (doprovod), `core/inbox.ts`, `core/simulate.ts`, `types/types-trade.ts`, `types/types-chronicle.ts`, `apps/web/lib/village-view-chronicle.ts`                      | výprava doma, test dvou vsí                      |
| 5     | `application/village-mail.ts` (nový), `application/shipments.ts` (exporty), `application/advance-world.ts`, `dynasty-for-village.ts`, `advance-dynasty.ts`                                                                                                   | doručení pošty, zaniklý hostitel                 |
| 6     | `application/market.ts` (nový), `application/index.ts`                                                                                                                                                                                                       | přehled vsí, odeslání výpravy                    |
| 7     | `apps/web/app/game/actions/market.ts` (nový), `app/game/actions.ts`, `apps/web/lib/village.ts` (akce), `market-view.ts` (nový), `village-input.ts`, `manor-view.ts`, `caravan-view.ts`, `village-notices.ts`, `village-commands.ts`, `application/rights.ts` | web – akce a pohledy, právo akce                 |
| 8     | `apps/web/components/game/hud/MarketPanel.tsx` (nový), `ManorPanel.tsx`, `components/game/VillageGame.tsx`, `village-game/use-panels.ts`, `apps/web/e2e/market.spec.ts` (nový)                                                                               | panel Trh, e2e                                   |
| 9     | `docs/design/markets.md`, `neighbours.md`, `horses.md` (doprovod), `CLAUDE.md` (řádek `village-trade.md`)                                                                                                                                                    | návrhy, celé e2e                                 |

Mapa kódu (`docs/code/*.md`) a testy, které úloha mění, jsou v jejích Files.

---

### Task 1: Ceny a zápočet trhu (Opus)

**Files:**

- Create: `types/types-market.ts` (typy níž, re-export v `types/index.ts`), `rules/rules-market.ts` (`MARKET = { grainKgPerCoin: 15, priceStep: 0.1 }` s komentářem odkazu na Rozhodnutí 3, re-export v `rules/index.ts`; další klíče přidají Úlohy 2 a 4)
- Create: `trade/market-prices.ts`, `trade/market-clearing.ts`
- Modify: `trade/goods.ts` – `PIECE_GOODS` (dobytek, koně, `logs`, `stone`, `hides`, `furs` – jednotky jako `TRADE_GOOD_NAMES` ve webu) a `isPieceGood`; export v `index.ts`
- Modify: `docs/code/village-trade.md` – nový oddíl „Trh – ceny a zápočet“
- Test: `trade/__tests__/market-prices.test.ts`, `trade/__tests__/market-clearing.test.ts`

**Interfaces:**

- Produces:

```ts
// types-market.ts
export type MarketPrices = Partial<Record<TradeGood, number>>; // mince za kg / kus / m³; chybí = výchozí
export interface MarketParty {
  key: string;
  offer: TradeGoods;
  wants: TradeGoods;
}
export interface MarketTrade {
  seller: string;
  buyer: string;
  good: TradeGood;
  amount: number;
}
/** Obchody dne v pořadí přidělení; offered / wanted = součty celých nabídek a seznamů (pro cenu). */
export interface MarketClearing {
  trades: MarketTrade[];
  offered: TradeGoods;
  wanted: TradeGoods;
}
// market-prices.ts
export function initialPrice(good: TradeGood): number; // TRADE_GOOD_VALUES[good].valueKg / MARKET.grainKgPerCoin
export function priceOf(prices: MarketPrices | undefined, good: TradeGood): number;
export function nextPrices(
  prices: MarketPrices,
  offered: TradeGoods,
  wanted: TradeGoods,
): MarketPrices; // nový objekt
// market-clearing.ts
export function clearMarket(parties: readonly MarketParty[], prices: MarketPrices): MarketClearing;
export function partyTotals(
  c: MarketClearing,
  key: string,
): { sold: TradeGoods; bought: TradeGoods };
```

- [ ] **Step 1: Testy.** Ceny:

```ts
expect(initialPrice('cows')).toBe(40);
expect(initialPrice('grain')).toBeCloseTo(1 / 15, 12);
expect(nextPrices({}, { cows: 2 }, { cows: 6 }).cows).toBeCloseTo(42, 9); // 40 × (1 + 0,1 × 4/8)
expect(nextPrices({}, { cows: 3 }, {}).cows).toBeCloseTo(36, 9);
expect(nextPrices({}, {}, { cows: 1 }).cows).toBeCloseTo(44, 9);
expect(nextPrices({ honey: 0.5 }, {}, {})).toEqual({ honey: 0.5 }); // bez nabídky i poptávky beze změny
let glut: MarketPrices = {};
for (let i = 0; i < 200; i++) glut = nextPrices(glut, { cows: 3 }, {}); // 200 dní jen nabídky
expect(glut.cows!).toBeGreaterThan(0);
expect(glut.cows!).toBeCloseTo(40 * 0.9 ** 200, 12);
```

Zápočet (ceny výchozí, krávy 40, obilí 1/15, `party = (key, offer, wants): MarketParty => ({ key, offer, wants })`). Hodnoty v mincích porovnávat `toBeCloseTo(…, 6)`:

```ts
// Martinův příklad (markets.md – Pravidla 3): hostitel B, A přijel dřív než C
const B = party('B', { cows: 2 }, { grain: 600 });
const A = party('A', { cows: 3 }, { grain: 1200 });
const C = party('C', { grain: 3000 }, { cows: 4 });
const c = clearMarket([B, A, C], {});
expect(partyTotals(c, 'C').bought).toEqual({ cows: 3 }); // 1 od B, 2 od A – napřed hostitel, pak podle příjezdu
expect(c.trades.filter((t) => t.good === 'cows').map((t) => [t.seller, t.amount])).toEqual([
  ['B', 1],
  ['A', 2],
]);
expect(partyTotals(c, 'B').bought.grain).toBeCloseTo(600, 6);
expect(partyTotals(c, 'A').bought.grain).toBeCloseTo(1200, 6);
// nikdo nic nechce → bez obchodů, offered / wanted jsou součty vstupů
expect(clearMarket([party('A', { cows: 2 }, {}), party('B', { grain: 600 }, {})], {})).toEqual({
  trades: [],
  offered: { cows: 2, grain: 600 },
  wanted: {},
});
// kus nevyjde: klisna (106,67) je dražší než seznam A (1 000 kg = 66,67) – neprodá se
const mare = [party('A', { mares: 1 }, { grain: 1000 }), party('B', { grain: 5000 }, { mares: 1 })];
expect(clearMarket(mare, {}).trades).toEqual([]);
// drobné: strop A je 66,67 – prodá 1 krávu (40) za 600 kg
const small = clearMarket(
  [party('A', { cows: 2 }, { grain: 1000 }), party('B', { grain: 5000 }, { cows: 2 })],
  {},
);
expect(partyTotals(small, 'A').sold).toEqual({ cows: 1 });
expect(partyTotals(small, 'A').bought.grain).toBeCloseTo(600, 6);
// výprava jen „na pivo“ (bez zboží a seznamu) v obchodech není a nic nezmění
expect(clearMarket([B, A, C, party('P', {}, {})], {})).toEqual(c);
```

Nakonec 20 pevných případů ze `deriveSeed(7, 'case:' + i)` (3–5 stran, náhodné nabídky a seznamy). Pro každý platí:

- prodané hodnotou = koupené u každé strany,
- součet prodaného = součet koupeného u každého zboží,
- nikdo neprodá víc, než nabídl, a nekoupí víc, než chtěl,
- nikdo neobchoduje sám se sebou,
- kusové zboží jen po celých kusech,
- stejný vstup dá týž výstup.

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-prices.test.ts packages/game/src/domain/village/trade/__tests__/market-clearing.test.ts` – FAIL.
- [ ] **Step 3: Implementovat.** Ceny podle Rozhodnutí 3. `clearMarket` (návrh Clauda – algoritmus testy neurčují):

```
EPS = 1e-6 mince; kusy ⌊x + 1e-9⌋; CLEARING_ROUNDS = 32 (konstanty v market-clearing.ts s komentářem
„technická mez algoritmu, ne pravidlo“ – proto ne v rules*.ts)
1. strop V každé strany = min(hodnota celé nabídky, hodnota celého seznamu) v cenách dne
2. kolo: nabídka strany oříznutá na hodnotu V (zboží v pořadí TRADE_GOODS, kusy celé, kg přesně), rozpočet = V;
   kupci v pořadí stran, u každého zboží jeho seznamu v pořadí TRADE_GOODS koupí
   min(zbývá na seznamu, zbývá v nabídkách ostatních stran, zbývá rozpočtu ÷ cena) – od prodávajících v pořadí stran
3. utrženo a utraceno každé strany; |utrženo − utraceno| ≤ EPS u všech → hotovo
4. jinak V = min(V, utrženo, utraceno) u každé strany a nové kolo od nuly (stropy jen klesají – když se nehnou,
   je každá strana vyrovnaná)
5. nevyrovnaná strana po posledním kole ten den neobchoduje: vyřadí se a počítá se znovu bez ní (nejvýš tolikrát,
   kolik je stran)
offered / wanted = součty celých (neoříznutých) nabídek a seznamů všech stran
```

- [ ] **Step 4: Spustit** testy z kroku 2 – PASS. Pak celé sady z Global Constraints.
- [ ] **Step 5: Commit** `feat(game): ceny trhu v mincovní míře a zápočet tržního dne` (`Refs #11`).

### Task 2: Co ves na trhu nabízí a shání a zpráva na pivo (Sonnet)

**Files:**

- Create: `trade/market-stance.ts`, `trade/village-report.ts`
- Modify: `domain/vassalage/spare.ts` – vytáhnout `grainReserveKg(state, day, outlook)` (pojistka, kterou `grainSpareKg` odečítá, i s osivem z `outlook`) a `grainOnHandKg(state)` (zásoby + zrno nevymlácených snopů); `grainSpareKg` je použije a exportuje se. Výsledek `villageSpare` beze změny.
- Modify: `trade/horse-trade.ts` – `horsesOf(state, good, day)`
- Modify: `types/types-market.ts` (`MarketStance`, `MarketArrivalNote`, `VillageReport`, `VillageMarket` zatím jen s `arrivals` – další pole a typy `MarketVisitor`, `MarketHorse` přidá Úloha 3), `types/types-state.ts` (`market?: VillageMarket`), `rules/rules-market.ts` (`report: { round: 5, traders: 10 }`, u `traders` komentář „technický strop paměti vsi, ne pravidlo hry“), `index.ts`
- Modify: `docs/code/village-trade.md` – oddíl „Trh – co ves nabízí a shání, zpráva na pivo“ (i `horsesOf`); `docs/code/vassalage.md` (Výhled vsi – `grainReserveKg`, `grainOnHandKg`)
- Test: `trade/__tests__/market-stance.test.ts`, `trade/__tests__/village-report.test.ts`, `trade/__tests__/horse-trade.test.ts` (`horsesOf`), `vassalage/__tests__/spare.test.ts` (nový test s pevnými čísly)

**Interfaces:**

- Produces:

```ts
export interface MarketStance {
  offer: TradeGoods;
  wants: TradeGoods;
}
/** Rozhodnutí 5 – jen makrokomodity výhledu dávek; nabídka nejvýš villageGoodStock. Stav nemění. */
export function marketStance(state: VillageState, day: number): MarketStance;
export interface MarketArrivalNote {
  name: string;
  day: number;
  goods: TradeGood[];
}
export interface VillageMarket {
  arrivals: MarketArrivalNote[]; // Úloha 3 přidá prices, visitors, nextOrder
}
export interface VillageReport {
  day: number;
  people: number;
  houses: number;
  crafts: Craft[];
  traders: MarketArrivalNote[];
}
/** Zpráva na pivo (markets.md – Pravidla 8): lidé a hotová obydlí zaokrouhleně, řemesla (ownCraftsmanWorks) v pořadí
 * potter, smith, burner, carpenter, obchodníci state.market?.arrivals od nejnovějšího, nejvýš MARKET.report.traders. */
export function villageReport(state: VillageState, day: number): VillageReport;
/** Na násobek MARKET.report.round, nejméně round, je-li n ≥ 1; 0 → 0. */
export function roughCount(n: number): number; // village-report.ts
// spare.ts
export function grainOnHandKg(state: VillageState): number;
export function grainReserveKg(state: VillageState, day: number, outlook: StewardOutlook): number;
export function grainSpareKg(state: VillageState, day: number, outlook: StewardOutlook): number; // dosud bez exportu
// horse-trade.ts – koně druhu v ohradách i pod jezdcem (druh podle věku a pohlaví jako sellableHorses)
export function horsesOf(state: VillageState, good: HorseGood, day: number): number;
```

`marketStance` spočte `outlook` jednou (Rozhodnutí 5) a `villageSpare` celý nevolá.

- [ ] **Step 1: Testy** (přípravky ze `core/__tests__/simulate-fixtures.ts`, koně z `__tests__/horse-fixtures.ts`). Napřed `spare.test.ts`: `it('výhled po vytažení pojistky obilí beze změny')` – `vlkov()` s 50 000 kg obilí a ves s polem `found(NOV_1)` s 50 000 kg (pojistka i s osivem): `expect(villageSpare(s, NOV_1)).toEqual({ … })` s čísly zapsanými z běhu na **nezměněném** kódu (projde před změnou i po ní). Pak:

```ts
// obilí nad pojistku
expect(marketStance(rich, day).offer.grain).toBe(villageSpare(rich, day).grainKg);
expect(marketStance(rich, day).wants.grain ?? 0).toBe(0);
// pod pojistku
const outlook = stewardOutlook(poor, day, craftCoverage(poor, day));
const short = grainReserveKg(poor, day, outlook) - grainOnHandKg(poor);
expect(marketStance(poor, day).wants.grain).toBeCloseTo(short, 6);
expect(marketStance({ ...poor, hungry: true }, day).offer.grain ?? 0).toBe(0);
// krávy (přípravek bez volů – chovné jádro je chovný pár)
const keep = breedingCows(herd) + oxenCalvesWanted(herd, day);
expect(keep).toBe(LIVESTOCK.breedingMin);
herd.livestock!.herds.cow = keep + 5;
expect(marketStance(herd, day).offer.cows).toBe(5);
herd.livestock!.herds.cow = 1;
expect(marketStance(herd, day).wants.cows).toBe(LIVESTOCK.breedingMin - 1);
// koně: klisny nad chovné na prodej, chybějící se shánějí
const mares = (n: number): VillageState =>
  horseVillage(Array.from({ length: n }, (_, i) => horse(i + 1, 5, 'female')));
const want = horsesWanted(mares(0), START).mares;
expect(want).toBeGreaterThan(0);
expect(marketStance(mares(want + 2), START).offer.mares).toBe(2);
expect(marketStance(mares(want + 2), START).wants.mares ?? 0).toBe(0);
expect(marketStance(mares(0), START).wants.mares).toBe(want);
// klády a kámen: celá hromada, nikdy ve wants
s.woodLogs = 37.6;
expect(marketStance(s, day).offer.logs).toBe(37);
expect(marketStance(s, day).offer.stone ?? 0).toBe(villageGoodStock(s, 'stone', day));
expect(marketStance(s, day).wants.logs ?? 0).toBe(0);
// ostatní zboží hostitel nenabízí ani neshání (stocked má maso, sýr, keramiku, hřivny a med)
for (const g of ['meat', 'cheese', 'pottery', 'ironBars', 'honey'] as const) {
  expect(marketStance(stocked, day).offer[g] ?? 0, g).toBe(0);
  expect(marketStance(stocked, day).wants[g] ?? 0, g).toBe(0);
}
// stav nemění
const before = structuredClone(s);
marketStance(s, day);
expect(s).toEqual(before);
// zpráva
expect([23, 2, 0, 7, 12].map(roughCount)).toEqual([25, 5, 0, 5, 10]);
expect(villageReport(with23people, day)).toMatchObject({ people: 25 });
expect(villageReport(s, day).crafts).toEqual(['potter', 'smith']); // pracující dílny, pevné pořadí
const r = villageReport(withArrivals12, day); // 12 příjezdů ve dnech day − 11 … day
expect(r.traders.map((t) => t.day)).toEqual(Array.from({ length: 10 }, (_, i) => day - i));
// horse-trade.test.ts: kůň pod jezdcem se počítá, prodat ho nejde
expect(horsesOf(ridden, 'ridingHorses', START)).toBe(2); // kůň 1 pod jezdcem, kůň 2 volný
expect(horsesForSale(ridden, 'ridingHorses', START)).toBe(1);
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-stance.test.ts packages/game/src/domain/village/trade/__tests__/village-report.test.ts packages/game/src/domain/village/trade/__tests__/horse-trade.test.ts packages/game/src/domain/vassalage` – FAIL (nový test `spare.test.ts` už projde).
- [ ] **Step 3: Implementovat** podle Rozhodnutí 5 a 7 a Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(game): co ves na trhu nabízí a shání a zpráva na pivo` (`Refs #11`).

### Task 3: Trh ve vsi hostitele (Opus)

**Files:**

- Create: `trade/market.ts`
- Modify: `types/types-market.ts` (typy níž; `VillageMarket` z Úlohy 2 dostane `prices`, `visitors`, `nextOrder`), `types/types-state.ts` (`outbox?: VillageMail[]`, `news?: VillageNews[]` s doc-komentáři a odkazem na markets.md – Pravidla 3, 8), `types/types-chronicle.ts` (`market-arrived`, `market-held`)
- Modify: `trade/horse-trade.ts` – `takeHorses(state, good, n, day): TradedHorse[]` (převod `Horse` → `TradedHorse` a `removeHorses` vytažený z `dispatchShipment`); `domain/vassalage/shipment.ts` ho použije (výsledek zásilek beze změny)
- Modify: `core/inbox.ts` – `VillageEventBody` dostane obě těla `MarketMailBody` už teď (`VillageMail` je posílá): `market-arrive` → `joinMarket`; `market-result` zatím vrátí `[]` s komentářem „použije Úloha 4 (`applyMarketResult`)“ – doručí ho až Úloha 5, do té doby nikam nedojde
- Modify: `core/simulate.ts` – `next.chronicle.push(...marketDay(next, day))` hned za `applyInboxDay` v `advanceVillageSteps`
- Modify: `index.ts` (exporty), `apps/web/lib/village-view-chronicle.ts` (texty níž) + `apps/web/lib/__tests__/village-view-chronicle-c.test.ts`
- Modify: `docs/code/village-trade.md` (oddíl „Trh ve vsi“), `docs/code/village-core.md` (Pořadí práce dne – trh po událostech schránky; Schránka vsi – `market-arrive`, `market-result`; Složky jádra – `trade/`)
- Test: `trade/__tests__/market.test.ts`, `trade/__tests__/horse-trade.test.ts`, `vassalage/__tests__/shipment.test.ts` (PASS beze změny), zlaté otisky (beze změny)

**Interfaces:**

- Consumes: Úloha 1 (`clearMarket`, `partyTotals`, `nextPrices`, `priceOf`), Úloha 2 (`marketStance`, `villageReport`, `VillageMarket`).
- Produces:

```ts
export interface MarketHorse { good: HorseGood; horse: TradedHorse }
export interface MarketArrival {
  key: string; // market:<domovská ves>:<id výpravy>
  fromVillageId: string; fromName: string; stayDays: number; travelDays: number;
  goods: TradeGoods; horses: MarketHorse[]; // koně i v goods jako počty po druzích
  wants: TradeGoods; report: VillageReport; // zpráva o domovské vsi
}
export interface MarketVisitor {
  key: string; fromVillageId: string; fromName: string; order: number;
  arrivedDay: number; lastDay: number; travelDays: number;
  goods: TradeGoods; horses: MarketHorse[]; wants: TradeGoods; // co zbývá
  sold: TradeGoods; bought: TradeGoods; boughtHorses: MarketHorse[];
}
export interface VillageMarket { prices: MarketPrices; visitors: MarketVisitor[]; nextOrder: number; arrivals: MarketArrivalNote[] }
export interface MarketResult {
  key: string; sold: TradeGoods; bought: TradeGoods; unsold: TradeGoods;
  horses: MarketHorse[]; // domů – neprodaní i koupení
  report?: VillageReport; prices?: MarketPrices;
  returned?: true; // hostitel zanikl (Úloha 5)
}
export type MarketMailBody =
  | { kind: 'market-arrive'; arrival: MarketArrival }
  | { kind: 'market-result'; result: MarketResult };
export interface VillageMail { villageId: string; day: number; ref: string; body: MarketMailBody } // ⊂ NewVillageEvent
export interface VillageNews { villageId: string; name: string; report: VillageReport; prices?: MarketPrices }
// trade/market.ts
export function joinMarket(state: VillageState, day: number, arrival: MarketArrival): ChronicleEvent[];
export function marketDay(state: VillageState, day: number): ChronicleEvent[];
/** Jediné místo, kde vzniká MarketResult (odjezd v marketDay, zaniklý hostitel v Úloze 5). Návštěvník: sold, bought,
 * unsold = goods, horses = [...horses, ...boughtHorses]; nepoužitý příjezd: sold {}, bought {}, unsold = goods, horses. */
export function marketResult(
  from: MarketVisitor | MarketArrival,
  extra?: Pick<MarketResult, 'report' | 'prices' | 'returned'>,
): MarketResult;
export function rememberNews(state: VillageState, news: VillageNews): void; // jedna na ves, novější report.day vyhrává
export function marketArrivalRef(key: string): string; // `${key}:in`
export function marketResultRef(key: string): string; // `${key}:out`
// types-chronicle.ts
| { day: number; kind: 'market-arrived'; villageName: string; goods: TradeGoods }
| { day: number; kind: 'market-held'; sold: TradeGoods; bought: TradeGoods }
```

- `joinMarket`:
  - založí `market`, chybí-li (`{ prices: {}, visitors: [], nextOrder: 1, arrivals: [] }`),
  - přidá návštěvníka s `order = nextOrder++` a `lastDay = day + stayDays − 1`,
  - zapíše poznámku do `arrivals` (nejvýš `MARKET.report.traders` posledních – technický strop, Rozhodnutí 7), `rememberNews` ze `arrival.report` a kroniku `market-arrived`,
  - týž `key` podruhé nic neudělá.
- `marketDay` – bez návštěvníků vrátí `[]` a stav nezmění (ani klíč `market`). Jinak:
  1. strany = hostitel (`key: 'host'`, `marketStance`) a návštěvníci podle `order`,
  2. `clearMarket`,
  3. vyrovnání obchodů:
     - hostitel prodává `addGood(state, g, −a, day)`, koně `takeHorses`,
     - hostitel kupuje `addGood(+)`, koně `addHorses`,
     - návštěvník: `goods`, `horses`, `sold`, `bought`, `boughtHorses`, `wants` − koupené,
     - koně jdou zápočtem jako počty po druzích; které kusy odejdou, určí u hostitele `takeHorses` (pořadí prodeje), u návštěvníka první kusy druhu z jeho `horses`,
  4. `market.prices = nextPrices(…)`,
  5. kronika `market-held`, prodal-li nebo koupil-li hostitel něco,
  6. návštěvník s `lastDay ≤ day` odjede: do `outbox` jde `{ villageId: fromVillageId, day: day + 1 + travelDays, ref: marketResultRef(key), body: { kind: 'market-result', result: marketResult(visitor, { report: villageReport(state, day), prices: market.prices }) } }`.
- Zaniklá ves se nesimuluje a události schránky nepoužije. Výpravy u ní vyřeší Úloha 5, tady se nic nepřidává.
- Texty kroniky:
  - `market-arrived` = „Na trh přišla výprava ze vsi ${villageName} – ${goodsText(goods)}.“ (bez zboží: „Na trh přišla výprava ze vsi ${villageName}.“),
  - `market-held` = „Na trhu ves prodala ${goodsText(sold)} a koupila ${goodsText(bought)}.“

- [ ] **Step 1: Testy** – `market.test.ts`. Ves M z přípravků: 8 krav (chovné jádro 3), obilí pod pojistkou aspoň o 1 000 kg (ne v hladu), den v červnu. Test napřed ověří `marketStance(m, D)` (`offer.cows` 5, `wants.grain` ≥ 1 000). Příjezd jako událost schránky:

```ts
const arrival = {
  key: 'market:h:1',
  fromVillageId: 'h',
  fromName: 'Vlkov',
  stayDays: 1,
  travelDays: 0,
  goods: { grain: 600 },
  horses: [],
  wants: { cows: 1 },
  report,
};
const event = {
  id: 'e1',
  seq: 1,
  villageId: 'm',
  day: D,
  body: { kind: 'market-arrive', arrival },
};
const after = advanceVillage(m, D, null, null, [event]);
expect(after.market!.visitors).toEqual([]);
expect(after.outbox).toEqual([
  {
    villageId: 'h',
    day: D + 1,
    ref: 'market:h:1:out',
    body: expect.objectContaining({ kind: 'market-result' }),
  },
]);
const result = (after.outbox![0]!.body as { result: MarketResult }).result;
expect(result.bought).toEqual({ cows: 1 });
expect(result.sold.grain).toBeCloseTo(600, 6);
expect(result.unsold).toEqual({});
expect(after.chronicle.find((e) => e.kind === 'market-held')).toMatchObject({ sold: { cows: 1 } });
// zboží hostitele bez šumu dne (ves za den žije dál) – krok trhu přímo na kopii
const direct = structuredClone(m);
joinMarket(direct, D, arrival);
marketDay(direct, D);
expect(direct.storesKg - m.storesKg).toBeCloseTo(600, 6);
expect(direct.livestock!.herds.cow - m.livestock!.herds.cow).toBe(-1);
expect(after.market!.prices.cows!).toBeLessThan(40); // nabídka 5 > poptávka 1
expect(after.market!.prices.grain!).toBeGreaterThan(1 / 15);
expect(after.news).toEqual([{ villageId: 'h', name: 'Vlkov', report }]);
expect(after.chronicle.map((e) => e.kind)).toEqual(
  expect.arrayContaining(['market-arrived', 'market-held']),
);
```

Další testy:

- Dvě výpravy (Martinův příklad přes `marketDay`): krávy napřed od hostitele, pak od dřívější výpravy.
- Pobyt 3 dny, druhá výprava přijede druhý den s tím, co první shání: první koupí druhý den a odjede třetí den s `day = D + 3`.
- Nikdo nic nechce: `unsold = goods`, `bought = {}`, zásoby hostitele = kontrolní běh, nabízené zboží zlevní.
- Bez návštěvníků: `JSON.stringify(advanceVillage(m, D + 5))` neobsahuje `"market"`, `"outbox"` ani `"news"`.
- Kousky dopočtu: `advanceVillage` do D + 3 vcelku = po dnech se stejnou schránkou (rovnost JSON).
- Koně: výprava prodá klisnu hostiteli, který klisny shání. V ohradě hostitele je kůň s `bornDay` a `training` ze záznamu a `result.horses` ji nemá.
- `takeHorses` = dřívější převod v `dispatchShipment` (`shipment.test.ts` beze změny).
- `marketResult(arrival, { returned: true })` = `{ key: 'market:h:1', sold: {}, bought: {}, unsold: { grain: 600 }, horses: [], returned: true }`; u návštěvníka `horses` = neprodaní + koupení koně.

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/vassalage/__tests__/shipment.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces. Nový druh těla schránky obslouží i ostatní `switch` nad `VillageEventBody`, jak je najde kompilátor.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady a `nice -n 19 npm run test:slow` – zlaté otisky beze změny.
- [ ] **Step 5: Commit** `feat(game): trh ve vsi hostitele – příjezd výpravy, tržní den a odjezd do odchozí schránky` (`Refs #11`).

### Task 4: Výprava na trh – domovská ves a test dvou vsí (Opus)

**Files:**

- Create: `trade/market-trip.ts`
- Modify: `types/types-market.ts` (`MarketOrder`, `MarketTarget`, `MarketTrip`), `types/types-trade.ts` (`TradeExpedition.kind?: 'shipment' | 'market'`, `market?: MarketTrip`), `types/types-chronicle.ts` (`market-departed`, `market-returned`), `rules/rules-market.ts` (`dayTripCells: 1`, `daysPerCell: 1`, `minStayDays: 1`)
- Modify: `trade/trade.ts` (práce nosičů – Rozhodnutí 2, termín je pevný):
  - `expeditionLaborNeed(state, day)` – `day` povinný. Výprava `'market'` chce práci jen ve dnech `startedDay ≤ day < market.returnDay`, mimo okno 0, i když `done < cost` (vsi chyběli dospělí). Ostatní výpravy beze změny.
  - `workExpeditions(state, away, day)` – totéž okno. `'market'` bez podílu po stezce, jako zásilka.
  - `finishExpeditions` – `'market'` nechá v seznamu (`return true` před kontrolou `done < cost`), bez zboží a kroniky. Výpravu smaže jen `applyMarketResult`.
- Modify: `core/simulate-work-apply.ts` (`workExpeditions(state, …, day)` – `day` z kontextu; `expeditionLaborToday` v `simulate-work.ts` `day` už má a jen ho předá dál), `core/inbox.ts` (`market-result` → `applyMarketResult` místo `[]` z Úlohy 3), `core/simulate.ts` (`marketTripsDay(next, day)` hned za `returnHome`), `index.ts`, `apps/web/lib/village-view-chronicle.ts` (texty níž) + `apps/web/lib/__tests__/village-view-chronicle-c.test.ts`
- Modify: `people/lord.ts` – `lordRides`: doprovod (`leaving`) jen výprava bez druhu (`e.kind === undefined` – k sousedovi po stezce, uložená před plánem 1), ne `'shipment'` ani `'market'` (Rozhodnutí 2)
- Modify: `docs/code/village-trade.md` (oddíl „Výprava na trh“, karavana – druh `'market'`, práce nosičů v okně dní), `docs/code/village-core.md` (Pořadí práce dne), `docs/code/village-livestock.md` (`lordRides` – doprovod jen výpravy po stezce)
- Test: `trade/__tests__/market-trip.test.ts`, `trade/__tests__/market-two-villages.test.ts`, `trade/__tests__/trade.test.ts` (volání `expeditionLaborNeed` ř. 173 a `workExpeditions` ř. 130, 135, 235 dostanou den výpravy na cestě, např. `DAY + 1` – očekávání beze změny), `livestock/__tests__/horse-riders.test.ts` (doprovod), `domain/vassalage/__tests__/shipment.test.ts` (zásilky beze změny; `expedition-trips.test.ts` smazala Úloha 6 plánu 1 s `expeditionTransport`), zlaté otisky (beze změny)

**Interfaces:**

- Consumes: Úloha 3 (`MarketArrival`, `MarketResult`, `MarketHorse`, `VillageMail`, `marketArrivalRef`, `marketResultRef`, `rememberNews`, `takeHorses`), Úloha 2 (`villageReport`).
- Produces:

```ts
export interface MarketOrder { give: TradeGoods; wants: TradeGoods; stayDays: number }
export interface MarketTarget { villageId: string; name: string; cells: number; firstStep: Direction8; homeVillageId: string; homeName: string }
export interface MarketTrip { key: string; villageId: string; name: string; wants: TradeGoods; stayDays: number; travelDays: number; arriveDay: number; returnDay: number }
export function marketTravelDays(cells: number): number;
/** Jedna jízda (Rozhodnutí 2): vozy z `carts` (v pořadí tradeCarts) vezou kg zboží, klády a kámen, CARTS.tradeCrew lidí
 * s každým vozem; zbytek nosiči TRADE.porterKg, klády bez vozu TRADE.logCarriers, honáci TRADE.headsPerDrover /
 * horsesPerDrover; porters = max(cesta tam s give, zpět s wants), aspoň 1; zvolí počet vozů s nejméně lidmi, při shodě
 * méně vozů; kámen bez vozu → null. */
export function marketCrew(give: TradeGoods, wants: TradeGoods, carts: readonly CartKind[]): { porters: number; carts: number } | null;
/** Vstup kontroly bez stavu vsi – server ho skládá ze stavu, web z pohledu dvorce (Úloha 7). */
export interface MarketTripCheck { stock: TradeGoods; carts: readonly CartKind[]; adults: number; cells: number; day: number }
export type MarketCheck =
  | { ok: true; porters: number; carts: number; travelDays: number; departDay: number; arriveDay: number; returnDay: number }
  | { ok: false; reason: string };
/** Jediné místo kontrol výpravy (pořadí níž) – volá ho planMarketTrip i náhled ve webu. */
export function checkMarketTrip(order: MarketOrder, input: MarketTripCheck): MarketCheck;
export type MarketPlan = (Extract<MarketCheck, { ok: true }> & { cartIds: number[] }) | { ok: false; reason: string };
/** checkMarketTrip nad stavem: stock = villageGoodStock(state, g, day) zboží z give, carts = druhy z tradeCarts(state, day),
 * adults = dospělí vsi; cartIds = prvních `carts` vozů z tradeCarts. */
export function planMarketTrip(state: VillageState, day: number, order: MarketOrder, target: MarketTarget): MarketPlan;
// trade.ts – nové podpisy
export function expeditionLaborNeed(state: Pick<VillageState, 'trade'>, day: number): number;
export function workExpeditions(state: VillageState, away: number, day: number): { used: number; shares: { trailId: number; manDays: number; carts?: number }[] };
export function departMarket(state: VillageState, day: number, order: MarketOrder, target: MarketTarget):
  { ok: true; state: VillageState; trip: MarketTrip } | { ok: false; reason: string };
export function applyMarketResult(state: VillageState, day: number, result: MarketResult): ChronicleEvent[];
export function marketTripsDay(state: VillageState, day: number): void; // den ≥ returnDay: výpravě zmizí `carts`
export const MARKET_STAY = 'Na trhu se zůstává aspoň den.';
export const MARKET_OVER_STOCK = 'Tolik ves nemá.';
export const MARKET_STONE_CART = 'Kámen uveze jen vůz.';
export const MARKET_NO_PEOPLE = 'Na výpravu ves nemá dost dospělých.';
export const MARKET_WORLD_END = 'Výprava by se do konce světa nevrátila.';
// types-chronicle.ts
| { day: number; kind: 'market-departed'; villageName: string; give: TradeGoods; wants: TradeGoods; returnDay: number }
| { day: number; kind: 'market-returned'; villageName: string; sold: TradeGoods; bought: TradeGoods; unsold: TradeGoods; returned?: true }
```

- `checkMarketTrip` kontroluje v tomto pořadí:
  1. `stayDays` celé ≥ `MARKET.minStayDays`,
  2. každé zboží `give` ≤ `stock[g]` (`villageGoodStock`) – chovné krávy i koně pod jezdci se tak prodat nedají,
  3. `marketCrew(give, wants, carts)` ≠ null,
  4. `porters` ≤ `adults`,
  5. `returnDay < TOTAL_GAME_DAYS`.

  Prázdné `give` i `wants` jsou dovolené (výprava „na pivo“). Kontroly 4 a 5 nejsou pravidla navíc: nosiči jsou lidé vsi jako u dřívější výpravy a den za koncem světa neexistuje.

- `departMarket` (na kopii; odmítnutí `planMarketTrip` vrátí jeho důvod):
  - odebere `give` (`addGood(−)`, koně `takeHorses`),
  - `trade ??= { expeditions: [], nextId: 1 }`,
  - přidá `TradeExpedition`:
    - `{ id, kind: 'market', direction: target.firstStep, trailId: −1, startedDay: departDay, give, get: {} }`,
    - `porters`, `carts: plan.cartIds`, `days = 2 × travel + stay`, `cost = porters × days`, `done: 0`,
    - `destination: { cells, firstStep }` a `market: trip`,
  - klíč je `market:${homeVillageId}:${id}`,
  - do `outbox` jde příjezd `{ villageId: target.villageId, day: arriveDay, ref: marketArrivalRef(key), body: { kind: 'market-arrive', arrival: { …, report: villageReport(state, day) } } }`,
  - kronika `market-departed`.
- `applyMarketResult`:
  - přidá `bought` a `unsold` (`addGood(+)`, koně `addHorses`),
  - smaže výpravu s `market.key === result.key`,
  - je-li `report` a výprava, zavolá `rememberNews({ villageId, name, report, prices })`,
  - zapíše kroniku `market-returned`.

  Zboží přidá, i když záznam výpravy chybí – nic nesmí zmizet.

- Texty kroniky:
  - `market-departed` = „Výprava vyrazila na trh do vsi ${villageName} – veze ${goodsText(give)}, shání ${goodsText(wants)}; doma bude ${formatGameDate(dateOfDayIndex(returnDay))}.“ Prázdnou část vynechat.
  - `market-returned`:
    - „Výprava se vrátila z trhu ve vsi ${villageName} – prodala ${goodsText(sold)}, koupila ${goodsText(bought)}.“,
    - když nic nevyměnila: „Výprava se vrátila z trhu ve vsi ${villageName} – nic nevyměnila.“,
    - s `returned`: „Výprava se vrátila ze vsi ${villageName} se vším, co vezla – ves už nestojí.“

- [ ] **Step 1: Testy** – `market-trip.test.ts`. Ves `h` z přípravků se čtyřkolákem, dvěma vycvičenými voly doma, aspoň 3 dospělými a 3 000 kg obilí; `target = { villageId: 'm', name: 'Lhota', cells: 1, firstStep: 'E', homeVillageId: 'h', homeName: 'Vlkov' }`; `report` libovolná `VillageReport`:

```ts
expect([1, 2, 3].map(marketTravelDays)).toEqual([0, 1, 2]);
expect(marketCrew({ grain: 600 }, { cows: 1 }, [])).toEqual({ porters: 24, carts: 0 });
// tam 2 lidé u vozu (CARTS.tradeCrew), zpět 2 u vozu + 1 honák koupené krávy
expect(marketCrew({ grain: 600 }, { cows: 1 }, ['four-wheel'])).toEqual({ porters: 3, carts: 1 });
expect(marketCrew({ logs: 3 }, {}, [])).toEqual({ porters: 6, carts: 0 });
expect(marketCrew({ stone: 1 }, {}, [])).toBeNull();
expect(marketCrew({}, {}, [])).toEqual({ porters: 1, carts: 0 });
// data cesty (dnes D)
const order = (give: TradeGoods, stayDays = 1): MarketOrder => ({ give, wants: {}, stayDays });
const base: MarketTripCheck = {
  stock: { cows: 3, grain: 10_000, stone: 5 },
  carts: [],
  adults: 12,
  cells: 1,
  day: D,
};
expect(checkMarketTrip(order({}), base)).toMatchObject({
  ok: true,
  departDay: D + 1,
  arriveDay: D + 1,
  returnDay: D + 2,
});
expect(checkMarketTrip(order({}, 2), { ...base, cells: 3 })).toMatchObject({
  arriveDay: D + 3,
  returnDay: D + 7,
});
// důvody v pořadí kontrol
expect(checkMarketTrip(order({}, 0), base)).toEqual({ ok: false, reason: MARKET_STAY });
expect(checkMarketTrip(order({ cows: 9 }), base)).toEqual({ ok: false, reason: MARKET_OVER_STOCK });
expect(checkMarketTrip(order({ stone: 1 }), base)).toEqual({
  ok: false,
  reason: MARKET_STONE_CART,
});
expect(checkMarketTrip(order({ grain: 750 }), base)).toEqual({
  ok: false,
  reason: MARKET_NO_PEOPLE,
}); // 30 nosičů
const late = { ...base, day: TOTAL_GAME_DAYS - 2 };
expect(checkMarketTrip(order({}), late)).toEqual({ ok: false, reason: MARKET_WORLD_END });
// departMarket
const sent = departMarket(h, D, { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 }, target);
if (!sent.ok) throw new Error(sent.reason);
const after = sent.state;
const e = after.trade!.expeditions.at(-1)!;
const key = `market:h:${e.id}`;
expect(h.storesKg - after.storesKg).toBeCloseTo(600, 6);
expect(e).toMatchObject({
  kind: 'market',
  trailId: -1,
  startedDay: D + 1,
  porters: 3,
  market: { key, returnDay: D + 2 },
});
expect(after.outbox).toEqual([
  expect.objectContaining({ villageId: 'm', day: D + 1, ref: `${key}:in` }),
]);
expect(after.chronicle.at(-1)).toMatchObject({
  kind: 'market-departed',
  villageName: 'Lhota',
  returnDay: D + 2,
});
// práce nosičů jen v okně dní, i když vsi chyběli lidé (Rozhodnutí 2)
expect([D, D + 1, D + 2].map((d) => expeditionLaborNeed(after, d))).toEqual([0, 3, 0]);
const short = structuredClone(after);
short.trade!.expeditions.at(-1)!.done = 0;
expect(expeditionLaborNeed(short, D + 2)).toBe(0);
expect(workExpeditions(structuredClone(short), 100, D + 2).used).toBe(0);
expect(workExpeditions(structuredClone(short), 100, D + 1)).toEqual({ used: 3, shares: [] });
// finishExpeditions výpravu na trh nesmaže a nic nepřidá
const done = structuredClone(after);
done.trade!.expeditions.at(-1)!.done = e.cost;
expect(finishExpeditions(done, D + 2)).toEqual([]);
expect(done.trade!.expeditions.at(-1)!.market!.key).toBe(key);
expect(done.storesKg).toBe(after.storesKg);
// vůz je pryč do returnDay, pak doma i bez výsledku
expect(cartsAway(after).has(e.carts![0]!)).toBe(true);
const home = structuredClone(after);
marketTripsDay(home, D + 2);
expect(cartsAway(home).has(e.carts![0]!)).toBe(false);
expect(home.trade!.expeditions.some((x) => x.market?.key === key)).toBe(true); // čeká na zboží
// applyMarketResult
const res: MarketResult = {
  key,
  sold: { grain: 600 },
  bought: { cows: 1 },
  unsold: {},
  horses: [],
  report,
  prices: { cows: 38 },
};
const back = structuredClone(after);
expect(applyMarketResult(back, D + 2, res)).toEqual([
  expect.objectContaining({ kind: 'market-returned' }),
]);
expect(back.livestock!.herds.cow - after.livestock!.herds.cow).toBe(1);
expect(back.trade!.expeditions.some((x) => x.market?.key === key)).toBe(false);
expect(back.news).toEqual([{ villageId: 'm', name: 'Lhota', report, prices: { cows: 38 } }]);
const orphan = structuredClone(h); // záznam výpravy chybí – zboží přibude i tak
applyMarketResult(orphan, D + 2, res);
expect(orphan.livestock!.herds.cow - h.livestock!.herds.cow).toBe(1);
```

`horse-riders.test.ts` (Rozhodnutí 2 – doprovod), vedle testu „výpravu vyrážející dnes doprovodí nejstarší jezdec mimo vojvodu“:

```ts
it('výpravu na trh nikdo nedoprovází – nemá stezku, jezdci jedou jako jindy', () => {
  const s = riding([horse(1, 5), horse(2, 6)]);
  const day = START + 1;
  const market = {
    id: 1,
    kind: 'market',
    trailId: -1,
    startedDay: day,
  } as unknown as TradeExpedition;
  s.trade = { nextId: 2, expeditions: [market] };
  const rides = lordRides(s, day)!;
  expect(rides.escort).toBeNull();
  expect(rides.riders.map((r) => r.riderId)).toEqual([LORD_ID, SON_ID]);
});
```

`market-two-villages.test.ts` (markets.md – Co se ověří bod 2 bez kupců). Vsi H a M z přípravků, M jako v Úloze 3, H jako výš. Den D v červnu. Vsi mezi kroky žijí (jídlo, práce, stáda), proto se bilance počítá jen ze zboží výpravy a trhu, ne z celých zásob:

```ts
const sent = departMarket(h, D, { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 }, target);
if (!sent.ok) throw new Error(sent.reason);
const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
const result = (out.body as { result: MarketResult }).result;
type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!; // obchody hostitele
const h1 = advanceVillage(withoutOutbox(sent.state), D + 2, null, null, asEvents(m1.outbox!));
const back = h1.chronicle.find((e) => e.kind === 'market-returned')!;
// v součtu nic nevznikne ani nezmizí
expect(h.storesKg - sent.state.storesKg).toBeCloseTo(600, 6); // odešlo z H (týž den, bez simulace)
expect(result.sold.grain! + (result.unsold.grain ?? 0)).toBeCloseTo(600, 6);
expect(held).toMatchObject({ sold: result.bought }); // co výprava koupila, hostitel prodal
expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6); // co výprava prodala, hostitel koupil
expect(back).toMatchObject({ sold: result.sold, bought: { cows: 1 }, unsold: result.unsold });
expect(h1.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
expect(m1.market!.prices.cows!).toBeLessThan(40); // cena
expect(h1.news![0]).toMatchObject({ villageId: 'm', prices: m1.market!.prices });
// 2 políčka: příjezd D+2, výsledek D+4, lidé pryč D+1 až D+3
const far = departMarket(
  h,
  D,
  { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
  { ...target, cells: 2 },
);
if (!far.ok) throw new Error(far.reason);
expect(far.state.outbox).toEqual([expect.objectContaining({ day: D + 2 })]);
const mFar = advanceVillage(m, D + 2, null, null, asEvents(far.state.outbox!));
expect(mFar.outbox).toEqual([
  expect.objectContaining({ day: D + 4, ref: marketResultRef(far.trip.key) }),
]);
expect([D + 1, D + 3, D + 4].map((d) => expeditionLaborNeed(far.state, d))).toEqual([3, 3, 0]);
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/village/livestock/__tests__/horse-riders.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady a `nice -n 19 npm run test:slow` – zlaté otisky beze změny.
- [ ] **Step 5: Commit** `feat(game): výprava na trh – odchod, lidé a vozy pryč, výsledek domů; test dvou vsí` (`Refs #11`).

### Task 5: Pošta mezi vsemi – doručení a zaniklý hostitel (Opus)

**Files:**

- Create: `packages/game/src/application/village-mail.ts`
- Modify: `application/shipments.ts` – exportovat `stepToward`, `placeOf`, `sleeps`, `crossesIsolation` (beze změny chování; `sleeps` v `appoint-lord.ts` znamená něco jiného a zůstane, jak je)
- Modify: `application/advance-world.ts` – smyčka `advancePlayer`:
  - dopočtená ves: po `loadVillage` ve stejném `tryRun` jako odchody správce `deliverVillageMailSafely`, má-li `hasVillageMail(village.state)` – i když nemá odchody správce (dnešní předčasný `return` to nesmí přeskočit),
  - ves, kterou už dopočítal web (`stamp.lastDay >= to`): před `continue` v `tryRun` `deliverVillageMailSafely(deps, stamp.id)` (načte ves sama, bez pošty nic neuloží a vrátí 0 – verzi přeskočené vsi hlídá stávající `advance-world.test.ts`, proměnná `untouched`). Do `step.villages` ani `step.days` se nepočítá. Nepovede-li se zámek, `busy` jako u dopočtu.
- Modify: `application/dynasty-for-village.ts`, `application/advance-dynasty.ts` – po kolech odchodů správce `deliverVillageMailSafely` u každé celé vsi s `hasVillageMail(state)`
- Modify: `application/index.ts`
- Modify: `docs/code/village-core.md` (Schránka vsi – odchozí schránka), `docs/code/worker.md` (doručení pošty po dopočtu), `docs/code/village-trade.md`
- Test: `application/__tests__/village-mail.test.ts`, `application/__tests__/advance-world.test.ts` (in-memory jako `shipments.test.ts`: `in-memory-villages.ts`, `in-memory-inbox.ts`, `in-memory-settlements.ts`)

**Interfaces:**

- Consumes: Úlohy 3–4 (`VillageMail`, `MarketResult`, `MarketArrival`, `marketResult`, `marketResultRef`, `marketArrivalRef`, `TradeExpedition.market`).
- Produces:

```ts
export interface VillageMailDeps {
  villages: VillageRepository;
  settlements: Pick<SettlementRepository, 'find'>;
}
/** Má ves co doručit: neprázdný `outbox`, nebo výprava 'market' s `lastDay ≥ market.returnDay` (výsledek nepřišel). */
export function hasVillageMail(state: VillageState): boolean;
/** Doručí odchozí schránku vsi a vyřeší její výpravy na trh po termínu (Rozhodnutí 6). Vrací počet zapsaných zpráv. */
export async function deliverVillageMail(deps: VillageMailDeps, villageId: string): Promise<number>;
/** Jako výš, chybu zapíše do logu a vrátí 0 – dopočet vsi nezastaví. */
export async function deliverVillageMailSafely(
  deps: VillageMailDeps,
  villageId: string,
): Promise<number>;
```

Postup `deliverVillageMail`:

1. Načte ves V. Každou zprávu `V.state.outbox` zapíše přes `villages.inbox.post`.
   - Cílová ves neexistuje (`villages.find` → null; `post` by na neznámé vsi spadl):
     - příjezd se změní ve výsledek `marketResult(arrival, { returned: true })` do schránky V,
     - výsledek pro zmizelou domovskou ves se zahodí.
2. Zapsané a zahozené `ref` z `outbox` smaže: `villages.find` + `villages.save(id, state, version)`, při konfliktu verze znovu, nejvýš `MAIL_ATTEMPTS = 5` (komentář „technická mez, ne pravidlo“). Prázdný `outbox` se ze stavu smaže celý.
3. Prochází výpravy V s `kind === 'market'` a `V.state.lastDay ≥ market.returnDay`. Pro každou načte hostitele M:
   - a. `M.state.outbox` má zprávu `marketResultRef(key)` → zapíše ji (`post`, duplicita se zahodí).
   - b. Jinak, je-li M pryč (`sleeps(M)`, `placeOf` null nebo M chybí):
     - příjezd je nepoužitý (ve `V.state.outbox`, nebo v `inbox.pending(M, M.lastDay, TOTAL_GAME_DAYS)` – jako `FAR_DAY` v `shipments.ts`, který se neexportuje) → do schránky V `marketResult(arrival, { returned: true })`,
     - jinak je-li v `M.state.market.visitors` návštěvník s `key` → `marketResult(visitor, { returned: true })` (co drží).

     Vždy s `ref = marketResultRef(key)` a `day = V.lastDay + 1`.

   - c. Živý hostitel bez výsledku znamená čekat.

- [ ] **Step 1: Testy** (dva hráči, H a M na sousedních políčkách, přípravky jádra):
  - Kolo tam a zpět: `departMarket` a uložení H, `deliverVillageMail(H)`, `loadVillage(M, D + 1)`, `deliverVillageMail(M)`, `loadVillage(H, D + 2)`:
    - H má krávu a M obilí,
    - `outbox` obou vsí je pryč,
    - druhé `deliverVillageMail` obou nic nezapíše (vrátí 0).
  - Web dopočte, worker doručí (pád po uložení H): H po `departMarket` uložená s `lastDay` = dnešek D (jako po akci webu), `deliverVillageMail` se nezavolá. `advancePlayer(hráč H, { today: D })` ves nedopočítává (`stamp.lastDay >= to`), přesto:
    - `inbox.pending(M, D, D + 1)` má jeden příjezd `market:<H>:<id>:in` s dnem D + 1,
    - uložená H nemá `outbox`,
    - druhé `advancePlayer` nic dalšího nezapíše (příjezd ve schránce M jednou).
  - Totéž pro hostitele: M dopočtená webem do D + 1 s výsledkem v `outbox` – `advancePlayer(hráč M, { today: D + 1 })` výsledek zapíše do schránky H.
  - Hostitel pozadu: H je dopočtená do D + 6, M ne:
    - `deliverVillageMail(H)` nic nezapíše,
    - po `loadVillage(M, D + 6)` a doručení dostane H výsledek v den D + 7 a zboží přibude jednou.
  - M vymře před příjezdem: po termínu dostane H `returned` se vším (obilí i koně zpět) a v kronice `market-returned` s `returned`.
  - Sídlo M archivované během pobytu, návštěvník už koupil: H dostane `unsold` + `bought` a M nic dalšího nezapíše.
  - `advancePlayer` obou hráčů po kolech workeru dá tentýž výsledek jako ruční postup.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application/__tests__/village-mail.test.ts packages/game/src/application/__tests__/advance-world.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady a `npm run test:db` (souběh webu a workeru v `packages/server`).
- [ ] **Step 5: Commit** `feat(game): odchozí schránka vsi – doručení výsledků trhu a návrat výpravy ze zaniklé vsi` (`Refs #11`).

### Task 6: Přehled vsí a odeslání výpravy – use-casy (Sonnet)

**Files:**

- Create: `packages/game/src/application/market.ts`
- Modify: `application/index.ts`
- Modify: `docs/code/village-trade.md` (oddíl „Přehled vsí“), `docs/code/world.md` (odkaz z Adresáře rodů – co je veřejné se nemění)
- Test: `application/__tests__/market.test.ts`

Klíč `ACTION_RIGHTS.sendMarketExpedition` přidá až Úloha 7 spolu s akcí ve `lib/village.ts` – `apps/web/lib/__tests__/action-rights.test.ts` chce každý klíč použitý tam, jinak by `npm run test` na konci téhle úlohy padl.

**Interfaces:**

- Consumes:
  - Úloha 4: `departMarket`, `marketTravelDays`, `MarketOrder`, `MarketTarget`,
  - Úloha 5: `deliverVillageMailSafely`, `VillageMailDeps`, `placeOf`, `stepToward`, `sleeps`, `settlementCell`, `crossesIsolation` (export z `shipments.ts`),
  - existující: `KnowledgeRepository.knownCellsOf` / `of`, `SettlementRepository.listActive` / `holderAt` / `find`, `HouseRepository.activeOf`, `updateLivingVillage(villages, villageId, today, landscape, change)`, `settlementLandscape`. Válka obchod nezakazuje (Rozhodnutí 7), `WarRepository` se nebere.
- Produces:

```ts
export interface MarketDeps extends VillageMailDeps {
  settlements: Pick<SettlementRepository, 'find' | 'listActive' | 'holderAt'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  knowledge: Pick<KnowledgeRepository, 'knownCellsOf' | 'of'>;
  landscapes: LandscapeSource;
}
export interface MarketVillage {
  villageId: string;
  name: string;
  houseName: string | null;
  own: boolean;
  cells: number;
  travelDays: number;
  blocked: string | null; // proč tam výprava nejede
  news: VillageNews | null; // zpráva na pivo z výpravy nebo od obchodníka (stav domovské vsi)
  seen: { day: number; houses: number; crafts: Craft[] } | null; // z výjezdů a tažení rodu (SeenDwelling, craft)
}
export async function marketOverview(
  deps: MarketDeps,
  input: { playerId: string; villageId: string },
): Promise<MarketVillage[] | null>;
export async function sendMarketExpedition(
  deps: MarketDeps,
  input: {
    playerId: string;
    villageId: string;
    targetVillageId: string;
    order: MarketOrder;
    today: number;
  },
): Promise<{ ok: true; arriveDay: number; returnDay: number } | { ok: false; reason: string }>;
export const MARKET_UNKNOWN = 'Tu ves lidé neznají.';
export const MARKET_GONE = 'Ta ves už nestojí.';
```

- `MarketDeps` skládá web z `gameDeps()` jako u ostatních akcí vsi. Bude-li implementace volat další metodu, rozšíří `Pick`.
- `marketOverview`:
  - zdroje a vyloučení podle Rozhodnutí 7: sousední mapy `holderAt` → `listActive(držitel)` → sídlo na tom políčku; mapy ze znalosti `knownCellsOf` (`villageIds`), domy a řemesla `of(houseId, cell)`,
  - bez domovské vsi a bez archivovaných sídel, každá ves jednou,
  - řazení podle `cells`, pak jména,
  - `null` = ves není hráče `playerId` (držitel; práva hlídá web).
- `sendMarketExpedition`:
  - cíl musí být v přehledu a bez `blocked`, jinak vrátí důvod,
  - `cells` a `firstStep` z políček sídel,
  - `updateLivingVillage(deps.villages, H, today, landscape, (s) => departMarket(s, today, order, target))` – ves pozadu se napřed dopočte do `today` (markets.md – Pravidla 3, poslední věta), `trip` z výsledku `departMarket` si use-case zachytí pro `arriveDay` a `returnDay`,
  - pak `deliverVillageMailSafely(deps, H)`.

  Volá se jako ostatní akce vsi pod zámkem hráče (`guardedAction` – Úloha 7).

- [ ] **Step 1: Testy:**
  - **Přehled** obsahuje:
    - druhou vlastní ves na sousedním políčku (`own: true`, `cells: 1`, `travelDays: 0`),
    - cizí ves na sousední mapě,
    - ves na mapě ze znalosti rodu o 3 políčka dál (`seen.houses`, `seen.crafts` z dílen ve znalosti),
    - ves jen ze `news` (zpráva i ceny).
  - **Přehled dál:**
    - vymřelá ves má `blocked: MARKET_GONE`, ves rodu ve válce v přehledu je a blokovaná není,
    - archivovaná ves v přehledu není,
    - odříznutý rod vidí jen své vsi.
  - **Odeslání:**
    - neznámý cíl vrátí `MARKET_UNKNOWN`, nedostatek zboží `MARKET_OVER_STOCK` (z jádra) a nic se neuloží,
    - úspěch: H má výpravu `'market'` a schránka M má příjezd s `ref` `market:<H>:<id>:in` a dnem `today + 1`,
    - ves pozadu (markets.md – Pravidla 3): H uložená s `lastDay = today − 5`. Po `sendMarketExpedition(…, today)` má uložená H `lastDay` `today` a výpravu `'market'` se `startedDay` `today + 1`. `inbox.pending(M, today − 6, TOTAL_GAME_DAYS)` vrátí jediný příjezd, a to s dnem `today + 1` (žádný dřívější den).
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application/__tests__/market.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(game): přehled známých vsí a odeslání výpravy na trh` (`Refs #11`).

### Task 7: Web – akce, pohledy a karavana (Sonnet)

**Files:**

- Create: `apps/web/app/game/actions/market.ts` (`'use server'`: `getMarketOverview`, `sendMarketExpedition` – vzor `declareHunt` ve `actions/village.ts`: `villageAction` z `_shared.ts` + parse), re-export v `app/game/actions.ts`
- Create: `apps/web/lib/market-view.ts`
- Modify: `apps/web/lib/village.ts` – obě akce vedle `declareHuntForPlayer` (rozhodnutí podle kódu – ne nový `lib/market.ts` a bez exportu `actOn` / `guardedAction`):
  - `sendMarketExpeditionForPlayer` přes `guardedAction(playerId, villageId, 'sendMarketExpedition', (ctx) => …)` s `today: ctx.day`; úspěch → `viewOf(done.ctx)`, odmítnutí → `{ refused: reason }`. `actOn` se nehodí (use-case nevrací `VillageResult`).
  - `marketOverviewForPlayer` – pohled bez práva přes `context(playerId, villageId)` jako `panelOptionsForPlayer`.
  - Proč tady: `apps/web/lib/__tests__/action-rights.test.ts` čte jen `lib/village.ts` a hlídá, že každý klíč `ACTION_RIGHTS` jde přes `guardedAction` / `actOn` právě tam. Akce v jiném souboru nebo vyvezený `guardedAction` by tu pojistku obešly.
- Modify: `packages/game/src/application/rights.ts` – `sendMarketExpedition: 'trade'` v `ACTION_RIGHTS` (v téže úloze jako akce, jinak `action-rights.test.ts` padne); `apps/web/lib/__tests__/action-rights.test.ts` – `'marketOverview'` do `reads` (pohled, ves nemění)
- Modify: `apps/web/lib/village-input.ts` (`parseMarketExpeditionInput` – celá nezáporná čísla, kg zboží celé kg, `stayDays` celé), `apps/web/lib/manor-view.ts` (`VillageManor.market`), `apps/web/lib/village-notices.ts` (upozornění k novým kronikám, chce-li je kompilátor), `components/game/village-game/village-commands.ts` (příkaz pro panel)
- Modify: `apps/web/lib/caravan-view.ts` – `'market'` jako `'shipment'`: `trailId: null`, `line` ke kraji ve směru `destination.firstStep`, tam s `give`, zpět nosiči, `trip: { kind: 'trade', to: market.name }`. Postup podle kalendáře, ne z `done/cost` (termín je pevný – Rozhodnutí 2): tam `startedDay … arriveDay`, ve dnech pobytu stojí za krajem mapy (`rate` 0), zpět od `arriveDay + stayDays` do `returnDay`.
- Modify: `docs/code/web-ui.md` (Rozložení server actions – `market.ts`; oddíl „Trh v rozhraní – akce a pohledy“)
- Test: `apps/web/lib/__tests__/market-view.test.ts`, `village-input.test.ts`, `manor-view.test.ts` (`sceneExpeditions`), `village-view-chronicle-c.test.ts`, `action-rights.test.ts`, `packages/game/src/application/__tests__/rights.test.ts` (nový klíč projde smyčkou nad `ACTION_RIGHTS` sám – hráč bez práva `trade` ve vsi seniorátu je odmítnut)

**Interfaces:**

- Consumes: Úloha 6 (`marketOverview`, `sendMarketExpedition`, `MarketVillage`, `MarketDeps`), Úloha 4 (`checkMarketTrip`, `MarketOrder`, `MarketTripCheck`, `marketTravelDays`, důvody `MARKET_*`; `planMarketTrip` jen v testu).
- Produces:

```ts
export interface MarketTripView {
  key: string; villageName: string;
  phase: 'out' | 'market' | 'back' | 'waiting'; // day < arriveDay | < arriveDay + stay | < returnDay | čeká na zboží
  daysLeft: number; // max(0, returnDay − day)
}
export function marketTripViews(state: VillageState, day: number): MarketTripView[];
export interface MarketPreview { porters: number; carts: number; awayDays: number; reason: string | null }
/** Jen převede checkMarketTrip(order, { ...market, cells }) – žádná vlastní kontrola; awayDays = returnDay − departDay. */
export function marketPreview(order: MarketOrder, market: VillageManor['market'], cells: number): MarketPreview;
// manor-view.ts – vstup kontroly bez `cells` (stock = villageGoodStock všech TRADE_GOODS) a výpravy na cestě
market: Omit<MarketTripCheck, 'cells'> & { trips: MarketTripView[] };
// lib/village.ts
export function marketOverviewForPlayer(playerId: string, villageId: string): Promise<MarketVillage[] | { error: string }>;
export function sendMarketExpeditionForPlayer(
  playerId: string,
  villageId: string,
  input: { targetVillageId: string; order: MarketOrder },
): Promise<VillageActionResult | { refused: string }>;
// actions/market.ts
export async function getMarketOverview(input: { villageId: string }): Promise<MarketVillage[] | { error: string }>;
export async function sendMarketExpedition(input: unknown): Promise<VillageActionResult>; // odmítnutí → { error: důvod }
```

- [ ] **Step 1: Testy:**
  - `marketTripViews` – čtyři fáze a `daysLeft`.
  - `marketPreview` – tentýž výsledek jako server: pro stav `s`, den `d` a pět objednávek (v pořádku, pobyt 0, víc než sklad, kámen bez vozu, málo dospělých) `marketPreview(order, manorView(s, d)!.market, cells).reason` = `planMarketTrip(s, d, order, target)` (`reason`, nebo `null` u `ok`); u `ok` stejné `porters`, `carts` = `cartIds.length` a `awayDays = 2 × travel + stay`.
  - `parseMarketExpeditionInput` – odmítne záporná čísla, desetiny kusů a neznámé zboží.
  - `sceneExpeditions` (`manor-view.test.ts`): výprava `'market'` má `trailId: null`, `line` ke kraji ve směru `firstStep` a `trip.to` jméno cílové vsi. Při cestě 1 den a pobytu 3 má v prostřední den pobytu `rate` 0 a tentýž `progress` jako první den pobytu.
  - Kronika – čtyři texty z Úloh 3–4 jsou v `village-view-chronicle-c.test.ts`.
  - `action-rights.test.ts` beze změny tvrzení projde s novým klíčem i s `marketOverviewForPlayer`.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib/__tests__ packages/game/src/application/__tests__/rights.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(web): akce a pohledy trhu – přehled vsí, výpravy na cestě, karavana` (`Refs #11`).

### Task 8: Web – panel Trh a e2e (Sonnet)

**Files:**

- Create: `apps/web/components/game/hud/MarketPanel.tsx` (+ `hud/__tests__/MarketPanel.test.tsx`), `apps/web/e2e/market.spec.ts`
- Modify: `hud/ManorPanel.tsx` (tlačítko `manor-market` s ikonou `icons/build/obchod.png`, Tooltip „Obchod“, zakázané bez práva `trade` jako dřív – `useRightDenied`), `village-game/use-panels.ts` (otevření a zavření; přehled se načte `getMarketOverview` jen při otevření panelu, jako seznam známých map), `components/game/VillageGame.tsx` (vykreslení)
- Modify: `docs/code/web-ui.md` (oddíl „Panel Trh“)

**Interfaces:**

- Consumes: Úloha 7 (`getMarketOverview`, `sendMarketExpedition` – pohled na ves jako ostatní akce, odmítnutí `{ error }`, `marketPreview`, `MarketTripView`, `VillageManor.market`), `TRADE_GOOD_NAMES`, `goodsText` (`lib/trade-names.ts`).
- Panel (rozložení jako dřívější panel obchodu – `b4f8dadc:apps/web/components/game/hud/TradePanel.tsx`, `hud-inset`, dva sloupce s hlavičkami „Dáš“ / „Dostaneš“). Prvky `data-testid`:

  | `data-testid`                              | Co ukazuje                                                                                                                                                       |
  | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `market-panel`                             | celý panel                                                                                                                                                       |
  | `market-village`                           | řádek vsi: jméno, ikona vzdálenosti s počtem dní cesty (Tooltip „Ráno tam, večer zpět“ / „{n} dní cesty“), vlastní rod; `blocked` zašedle s důvodem v Tooltip    |
  | `market-report`                            | zpráva: ikony lidí „≈ N“, domů „≈ N“, řemesel, obchodníků (jméno, datum, ikony zboží), cen (`resources/balance.png`); Tooltip „Zpráva z {datum}“; bez zprávy „?“ |
  | `market-give-<good>`, `market-want-<good>` | řádky zboží (ikona, číslo, +/−)                                                                                                                                  |
  | `market-stay`                              | dny na trhu                                                                                                                                                      |
  | `market-preview`                           | nosiči, vozy, dní pryč                                                                                                                                           |
  | `market-send`                              | odeslání; Tooltip „Vyslat výpravu“ nebo důvod z náhledu                                                                                                          |
  | `market-error`                             | důvod od serveru, dokud se výběr nezmění                                                                                                                         |
  | `market-trip`                              | výprava na cestě: jméno vsi, ikona fáze, dní do návratu; Tooltip „Na cestě na trh“ / „Na trhu“ / „Na cestě domů“ / „Čeká na zboží“                               |

  Používat jen existující ikony, novou nekreslit.

- [ ] **Step 1: Testy** – `MarketPanel.test.tsx`:
  - řádky vsí a zašedlá ves s důvodem,
  - klik na ves ukáže zprávu (i „?“),
  - výběr zboží přepočítá náhled,
  - `market-send` je zakázané s důvodem náhledu,
  - odmítnutí serveru ukáže `market-error`,
  - výpravy na cestě.

  `ManorPanel.test.tsx`: tlačítko `manor-market` otevře panel.

- [ ] **Step 2: Spustit** `npx vitest run apps/web/components/game/hud/__tests__/MarketPanel.test.tsx apps/web/components/game/hud/__tests__/ManorPanel.test.tsx` – FAIL.
- [ ] **Step 3: Implementovat** panel. Pak e2e `market.spec.ts`:
  - **Příprava:**
    - `registerAndEnterGame` a založení vsi,
    - `villageOnNextMap(settlementId, 'Lhota', { own: true })`,
    - `changeVillageState`: domovská ves s obilím 3 000 kg a dost dospělými (`twoHouseholds`).
  - **Akce:**
    - otevřít dvorec a `manor-market`,
    - `market-village` „Lhota“ má Tooltip „Ráno tam, večer zpět“,
    - Dáš obilí 100, Dostaneš klády 1, pobyt 1, `market-send`.
  - **Očekávání:**
    - `market-trip` `toHaveCount(1)`,
    - v DB (`villageState`) má domovská ves výpravu `kind: 'market'`,
    - `query` na `village_inbox` vsi Lhota najde `body->>'kind' = 'market-arrive'` s `ref` `market:%:in`.
- [ ] **Step 4: Spustit** testy kroku 2 – PASS. Pak celé sady a `cd apps/web && npx playwright test market --project=chromium` – PASS.
- [ ] **Step 5: Commit** `feat(web): panel Trh ve dvorci – přehled vsí, zpráva na pivo, výprava na trh` (`Refs #11`).

### Task 9: Návrhy, celé e2e a ověření (Sonnet)

**Files:**

- Modify: `docs/design/markets.md`:
  - Stav: plán 2 hotový s datem,
  - nový oddíl „Rozhodnutí plánu 2“: body 1–9 tohoto plánu jako „návrh Clauda“ a všechna čísla `MARKET` s odkazem; u `MARKET.report.traders = 10` zdůvodnění „technický strop, ne pravidlo hry – stav vsi nesmí růst donekonečna, zpráva na pivo proto ukáže posledních 10 obchodníků“,
  - Co se ověří bod 2: „**Ověřeno <datum>** bez kupců a mincí – `market-two-villages.test.ts` …“.
- Modify: `docs/design/neighbours.md` – Stav jednou větou: body 2–5 (výpis souseda, nabídka, platba, přesun zboží) nahradil trh ve vsi (markets.md, plán 2).
- Modify: `docs/design/horses.md` – Doprovod výpravy jednou větou: jen výprava po zemské stezce; výprava na trh a zásilka stezku nemají a doprovod nemají (markets.md, plán 2, návrh Clauda).
- Modify: `CLAUDE.md` – v mapě kódu řádek `village-trade.md` doplnit o „trh ve vsi, výprava na trh, přehled vsí“.
- [ ] **Step 1: Dokumenty** podle Files. `npm run check:docs` – PASS a `grep -n -i "koordin\|za Martina" docs/design/markets.md docs/design/neighbours.md docs/design/horses.md` nic nevrátí.
- [ ] **Step 2: Celé e2e** – `npm run test:e2e` (projekty chromium i worker, sériově) – PASS.
- [ ] **Step 3:** Celé sady z Global Constraints, `nice -n 19 npm run test:slow` (zlaté otisky beze změny) a `npm run test:db` – PASS.
- [ ] **Step 4: Commit** `docs: trh bez mincí v návrzích – rozhodnutí plánu 2, ověření dvou vsí` (`Refs #11`).

## Otázka na Martina

Žádná. Co návrh neurčuje (model ceny, zápočet, doba cesty, oběh mezi vsemi, rozhraní, převod), rozhoduje plán jako „návrh Clauda“ v Rozhodnutích 1–9. Následky, které hráč pocítí: řídký trh bez mincí (Rozhodnutí 4), klády a kámen hostitele na prodej celé (Rozhodnutí 5), zboží od pozdního hostitele přijde po lidech (Rozhodnutí 6), zpráva na pivo ukáže nejvýš 10 posledních obchodníků (technický strop, Rozhodnutí 7).
