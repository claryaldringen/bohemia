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
- **Žádná pravidla navíc:** žádné cenové meze, minimální zásoby, strop pobytu ani počtu výprav, opakované výpravy ani automatika za hráče. Strop kol zápočtu je technická mez algoritmu, ne pravidlo.
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

   | Zboží                          | Nabízí                                                                       | Shání                                                                                           |
   | ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
   | obilí                          | `villageSpare(…).grainKg` (nad pojistku `VASSALAGE.reserveYears`, v hladu 0) | `grainReserveKg − (zásoby + zrno nevymlácených snopů)`, je-li kladné                            |
   | krávy                          | `cattleSpare(…).cows` (`surplusCows`)                                        | `breedingCows + oxenCalvesWanted − krávy`, je-li kladné                                         |
   | mladí a vycvičení voli         | `cattleSpare` (napřed mladí)                                                 | vycvičení voli `oxenTrainingTarget − voli v ohradách (i ve výcviku) − oxenComing`, je-li kladné |
   | hříbata, klisny, jezdečtí koně | `min(horsesForSale(druh), má(druh) − horsesWanted(druh))`, je-li kladné      | `horsesWanted(druh) − má(druh)`, je-li kladné                                                   |
   | klády, kámen                   | celá hromada (jako výhled dávek – „pojistka na ně není“)                     | nic                                                                                             |
   | ostatní zboží                  | nic                                                                          | nic                                                                                             |

   Nabídka je nejvýš `villageGoodStock`. Ostatní zboží (jídlo, výrobky, hřivny, med, kůže…) se v plánu 2 vyměňuje jen mezi výpravami. Řemeslné výrobky a jídlo do potřeby vsi přidá plán 3 (vesničané a řemeslníci na trhu).

6. **Oběh mezi vsemi** (Nechává se na stavitele):
   - Ves sbírá zprávy pro jiné vsi do **odchozí schránky** `VillageState.outbox: VillageMail[]` (`{ villageId, day, ref, body }`). Zprávou je příjezd výpravy a výsledek trhu.
   - `deliverVillageMail` je zapíše do schránek cílových vsí (`inbox.post`; druhý zápis téhož `ref` se zahodí) a doručené smaže (`villages.save` s verzí, opakování při souběhu).
   - Volá se po dopočtu tam, kde dnes vybavení odchodů správce (`advancePlayer`, `dynasty-for-village`, `advance-dynasty`), a po odeslání výpravy. Pád mezi uložením a zápisem doručí příští dopočet.
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
       (rozhodnutí koordinátora 23. 11. 2026: pravidlo navíc z podkladu neighbours.md – Pravidla 1 se nezavádí).
   - **Vzdálenost** = políčka (`cellDistance`) a dny cesty `marketTravelDays`.
   - **Zpráva na pivo** (`villageReport`): lidé a domy zaokrouhleně (`MARKET.report.round = 5`, nejméně 5, je-li aspoň jeden), řemesla s pracujícím řemeslníkem a posledních `MARKET.report.traders = 10` obchodníků. U každého obchodníka je, odkud přišel, kdy a s jakým zbožím (issue #11: „kdy tam kdo přijel s čím obchodovat“).
   - **Odkud zpráva přijde:**
     - Domů ji přinese výprava se svým výsledkem, i s cenami trhu toho dne.
     - Hostitel ji dostane od každé výpravy, která k němu přijde („obchodník, který přijel k nám“).
     - Z výjezdů a tažení jsou jen domy a řemesla, jak je muži viděli (`SeenDwelling.craft`).
   - **„Stárne s časem“:** u zprávy se ukáže její stáří. Žádné mizení se nepřidává.
   - Výprava „jen na pivo“ bez zboží je dovolená.

8. **Převod stavu:** žádný (Global Constraints).
9. **Rozhraní:**
   - Tlačítko Obchod ve dvorci se vrací (`icons/build/obchod.png`) a otevře panel Trh.
   - Panel Trh má tyto části:
     - přehled vsí,
     - zpráva vybrané vsi,
     - sestavení výpravy (sloupce „Dáš“ / „Dostaneš“, dny na trhu, náhled nosičů, vozů a dní pryč, odeslat),
     - výpravy na cestě.
   - Karavana ve scéně jde jako zásilka (ke kraji mapy ve směru `destination.firstStep`). Kronika a upozornění mají čtyři nové záznamy.
10. **Co se z plánu 1 vrací:**
    - Obchodní výprava hráče se vrací jako výprava na trh, bez lidí – výměna lidí je v plánu 3.
    - Hřivny jsou zboží trhu.
    - Zlý rok kraje se projeví v cenách (bod 3).
    - Právo `trade` dostane akce `sendMarketExpedition`.
11. **Pořadí úloh:**
    - 1–2 jsou čisté funkce a jdou souběžně.
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
   - server i náhled v panelu odmítnou s týmž důvodem,
   - nic neodejde.

   Test v Úlohách 4 a 7.

## Mapa souborů

Složka `packages/game/src/domain/village/`, není-li uvedeno jinak.

| Úloha | Soubory                                                                                                                                                                                                                     | Co                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1     | `types/types-market.ts` (nový), `rules/rules-market.ts` (nový), `trade/market-prices.ts`, `trade/market-clearing.ts`, `trade/goods.ts` (`PIECE_GOODS`)                                                                      | ceny a zápočet                                   |
| 2     | `trade/market-stance.ts`, `trade/village-report.ts`, `domain/vassalage/spare.ts` (`grainReserveKg`), `types/types-market.ts`, `types/types-state.ts` (`market?`)                                                            | co ves nabízí a shání, zpráva na pivo, typy trhu |
| 3     | `trade/market.ts`, `trade/horse-trade.ts` (`takeHorses`), `core/inbox.ts`, `core/simulate.ts`, `types/types-state.ts`, `types/types-chronicle.ts`, `domain/vassalage/shipment.ts`, `apps/web/lib/village-view-chronicle.ts` | trh u hostitele                                  |
| 4     | `trade/market-trip.ts`, `trade/trade.ts`, `core/simulate-work.ts`, `core/inbox.ts`, `core/simulate.ts`, `types/types-trade.ts`, `types/types-chronicle.ts`, `apps/web/lib/village-view-chronicle.ts`                        | výprava doma, test dvou vsí                      |
| 5     | `application/village-mail.ts` (nový), `application/shipments.ts` (exporty), `application/advance-world.ts`, `dynasty-for-village.ts`, `advance-dynasty.ts`                                                                  | doručení pošty, zaniklý hostitel                 |
| 6     | `application/market.ts` (nový), `application/rights.ts`, `application/index.ts`                                                                                                                                             | přehled vsí, odeslání výpravy                    |
| 7     | `apps/web/app/game/actions/market.ts` (nový), `apps/web/lib/market.ts` (nový), `market-view.ts` (nový), `village-input.ts`, `manor-view.ts`, `caravan-view.ts`, `village-notices.ts`, `village-commands.ts`                 | web – akce a pohledy                             |
| 8     | `apps/web/components/game/hud/MarketPanel.tsx` (nový), `ManorPanel.tsx`, `village-game/use-panels.ts`, `apps/web/e2e/market.spec.ts` (nový)                                                                                 | panel Trh, e2e                                   |
| 9     | `docs/design/markets.md`, `neighbours.md`, `CLAUDE.md` (řádek `village-trade.md`)                                                                                                                                           | návrhy, celé e2e                                 |

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
// 200 dní jen nabídky: cena > 0
```

Zápočet (ceny výchozí, krávy 40, obilí 1/15). Hodnoty v mincích porovnávat `toBeCloseTo(…, 6)`:

```ts
// Martinův příklad (markets.md – Pravidla 3): hostitel B nabízí 2 krávy, shání 600 kg obilí; A (přijel dřív)
// nabízí 3 krávy, shání 1 200 kg; C nabízí 3 000 kg obilí, shání 4 krávy
const c = clearMarket([B, A, C], {});
expect(partyTotals(c, 'C').bought).toEqual({ cows: 3 }); // 1 od B, 2 od A – napřed hostitel, pak podle příjezdu
expect(c.trades.filter((t) => t.good === 'cows').map((t) => [t.seller, t.amount])).toEqual([
  ['B', 1],
  ['A', 2],
]);
expect(partyTotals(c, 'B').bought.grain).toBeCloseTo(600, 6);
expect(partyTotals(c, 'A').bought.grain).toBeCloseTo(1200, 6);
// nikdo nic nechce → trades [] a offered / wanted jsou součty vstupů
// kus nevyjde: A nabízí 1 klisnu (106,67), shání 1 000 kg obilí (66,67); B nabízí obilí, shání klisnu → trades []
// drobné: A nabízí 2 krávy, shání 1 000 kg; B nabízí 5 000 kg, shání 2 krávy → A prodá 1 krávu za 600 kg
// výprava bez zboží a bez seznamu (jen „na pivo“) → v obchodech není
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
EPS = 1e-6 mince; kusy ⌊x + 1e-9⌋; CLEARING_ROUNDS = 32 (technické konstanty v market-clearing.ts)
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
- Modify: `domain/vassalage/spare.ts` – vytáhnout `grainReserveKg(state, day)` (pojistka, kterou `grainSpareKg` odečítá; výsledek `villageSpare` beze změny), export
- Modify: `types/types-market.ts` (`MarketStance`, `MarketArrivalNote`, `VillageReport` a typy trhu `VillageMarket`, `MarketVisitor`, `MarketHorse` – tvar v Úloze 3, chování přidá Úloha 3), `types/types-state.ts` (`market?: VillageMarket`), `rules/rules-market.ts` (`report: { round: 5, traders: 10 }`), `index.ts`
- Modify: `docs/code/village-trade.md` – oddíl „Trh – co ves nabízí a shání, zpráva na pivo“; `docs/code/vassalage.md` (Výhled vsi – `grainReserveKg`)
- Test: `trade/__tests__/market-stance.test.ts`, `trade/__tests__/village-report.test.ts`, stávající `vassalage/__tests__/spare.test.ts` (PASS beze změny)

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
export function grainReserveKg(state: VillageState, day: number): number; // spare.ts
```

- [ ] **Step 1: Testy** (přípravky ze `core/__tests__/simulate-fixtures.ts`):

```ts
// obilí nad pojistku
expect(marketStance(rich, day).offer.grain).toBe(villageSpare(rich, day).grainKg);
expect(marketStance(rich, day).wants.grain ?? 0).toBe(0);
// pod pojistku
expect(marketStance(poor, day).wants.grain).toBeCloseTo(grainReserveKg(poor, day) - have(poor), 6);
expect(marketStance({ ...poor, hungry: true }, day).offer.grain ?? 0).toBe(0);
// krávy: 8 krav, chovné jádro 3 → offer.cows 5; 1 kráva, jádro 3 → wants.cows 2
// klády a kámen: offer = celá hromada (celé kusy / m³), wants 0
// maso, sýr, keramika, hřivny, med … – ani v offer, ani ve wants
expect(marketStance(s, day)).toEqual(marketStance(s, day)); // a stav s je po volání deep-equal kopii před ním
// zpráva
expect(villageReport(with23people, day)).toMatchObject({ people: 25 }); // 2 lidé → 5, 0 → 0, 7 domů → 5
expect(villageReport(s, day).crafts).toEqual(['potter', 'smith']); // pracující dílny, pevné pořadí
expect(villageReport(withArrivals12, day).traders).toHaveLength(10); // nejnovější první
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade/__tests__/market-stance.test.ts packages/game/src/domain/village/trade/__tests__/village-report.test.ts packages/game/src/domain/vassalage` – FAIL.
- [ ] **Step 3: Implementovat** podle Rozhodnutí 5 a 7 a Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(game): co ves na trhu nabízí a shání a zpráva na pivo` (`Refs #11`).

### Task 3: Trh ve vsi hostitele (Opus)

**Files:**

- Create: `trade/market.ts`
- Modify: `types/types-market.ts` (typy níž; `VillageMarket`, `MarketVisitor`, `MarketHorse` už z Úlohy 2), `types/types-state.ts` (`outbox?: VillageMail[]`, `news?: VillageNews[]` s doc-komentáři a odkazem na markets.md – Pravidla 3, 8), `types/types-chronicle.ts` (`market-arrived`, `market-held`)
- Modify: `trade/horse-trade.ts` – `takeHorses(state, good, n, day): TradedHorse[]` (převod `Horse` → `TradedHorse` a `removeHorses` vytažený z `dispatchShipment`); `domain/vassalage/shipment.ts` ho použije (výsledek zásilek beze změny)
- Modify: `core/inbox.ts` – tělo `{ kind: 'market-arrive'; arrival: MarketArrival }` → `joinMarket`
- Modify: `core/simulate.ts` – `next.chronicle.push(...marketDay(next, day))` hned za `applyInboxDay` v `advanceVillageSteps`
- Modify: `index.ts` (exporty), `apps/web/lib/village-view-chronicle.ts` (texty níž) + test kroniky
- Modify: `docs/code/village-trade.md` (oddíl „Trh ve vsi“), `docs/code/village-core.md` (Pořadí práce dne – trh po událostech schránky; Schránka vsi – `market-arrive`; Složky jádra – `trade/`)
- Test: `trade/__tests__/market.test.ts`, `trade/__tests__/horse-trade.test.ts`, `vassalage/__tests__/shipment.test.ts` (PASS beze změny), zlaté otisky (beze změny)

**Interfaces:**

- Consumes: Úloha 1 (`clearMarket`, `partyTotals`, `nextPrices`, `priceOf`), Úloha 2 (`marketStance`, `villageReport`).
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
  - zapíše poznámku do `arrivals` (nejvýš `MARKET.report.traders`), `rememberNews` ze `arrival.report` a kroniku `market-arrived`,
  - týž `key` podruhé nic neudělá.
- `marketDay` – bez návštěvníků vrátí `[]` a stav nezmění (ani klíč `market`). Jinak:
  1. strany = hostitel (`key: 'host'`, `marketStance`) a návštěvníci podle `order`,
  2. `clearMarket`,
  3. vyrovnání obchodů:
     - hostitel prodává `addGood(state, g, −a, day)`, koně `takeHorses`,
     - hostitel kupuje `addGood(+)`, koně `addHorses`,
     - návštěvník: `goods`, `horses`, `sold`, `bought`, `boughtHorses`, `wants` − koupené,
  4. `market.prices = nextPrices(…)`,
  5. kronika `market-held`, prodal-li nebo koupil-li hostitel něco,
  6. návštěvník s `lastDay ≤ day` odjede: do `outbox` jde `{ villageId: fromVillageId, day: day + 1 + travelDays, ref: marketResultRef(key), body: { kind: 'market-result', result: { key, sold, bought, unsold: goods, horses: [...horses, ...boughtHorses], report: villageReport(state, day), prices } } }`.
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
const control = advanceVillage(m, D, null, null, []);
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
expect(after.storesKg - control.storesKg).toBeCloseTo(600, 6);
expect(after.livestock!.herds.cow - control.livestock!.herds.cow).toBe(-1);
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

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade packages/game/src/domain/vassalage/__tests__/shipment.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces. Nový druh těla schránky obslouží i ostatní `switch` nad `VillageEventBody`, jak je najde kompilátor.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady a `nice -n 19 npm run test:slow` – zlaté otisky beze změny.
- [ ] **Step 5: Commit** `feat(game): trh ve vsi hostitele – příjezd výpravy, tržní den a odjezd do odchozí schránky` (`Refs #11`).

### Task 4: Výprava na trh – domovská ves a test dvou vsí (Opus)

**Files:**

- Create: `trade/market-trip.ts`
- Modify: `types/types-market.ts` (`MarketOrder`, `MarketTarget`, `MarketTrip`), `types/types-trade.ts` (`TradeExpedition.kind?: 'shipment' | 'market'`, `market?: MarketTrip`), `types/types-chronicle.ts` (`market-departed`, `market-returned`), `rules/rules-market.ts` (`dayTripCells: 1`, `daysPerCell: 1`, `minStayDays: 1`)
- Modify: `trade/trade.ts`:
  - `expeditionLaborNeed(state, day)` – výprava `'market'` jen ve dnech `startedDay ≤ day < market.returnDay`,
  - `workExpeditions` – `'market'` bez podílu po stezce, jako zásilka,
  - `finishExpeditions` – `'market'` přeskočí.
- Modify: `core/simulate-work.ts` (předat `day`), `core/inbox.ts` (tělo `market-result` → `applyMarketResult`), `core/simulate.ts` (`marketTripsDay(next, day)` hned za `returnHome`), `index.ts`, `apps/web/lib/village-view-chronicle.ts` (texty níž) + test
- Modify: `docs/code/village-trade.md` (oddíl „Výprava na trh“, karavana – druh `'market'`), `docs/code/village-core.md` (Pořadí práce dne)
- Test: `trade/__tests__/market-trip.test.ts`, `trade/__tests__/market-two-villages.test.ts`, `domain/vassalage/__tests__/shipment.test.ts` (zásilky beze změny; `expedition-trips.test.ts` smazala Úloha 6 plánu 1 s `expeditionTransport`), zlaté otisky (beze změny)

**Interfaces:**

- Consumes: Úloha 3 (`MarketArrival`, `MarketResult`, `MarketHorse`, `VillageMail`, `marketArrivalRef`, `rememberNews`, `takeHorses`), Úloha 2 (`villageReport`).
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
export type MarketPlan =
  | { ok: true; porters: number; carts: number[]; travelDays: number; departDay: number; arriveDay: number; returnDay: number }
  | { ok: false; reason: string };
export function planMarketTrip(state: VillageState, day: number, order: MarketOrder, target: MarketTarget): MarketPlan;
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

- `planMarketTrip` kontroluje v tomto pořadí:
  1. `stayDays` celé ≥ `MARKET.minStayDays`,
  2. každé zboží `give` ≤ `villageGoodStock(state, g, day)` – chovné krávy i koně pod jezdci se tak prodat nedají,
  3. `marketCrew(give, wants, tradeCarts(state, day).map((c) => c.kind))` ≠ null,
  4. `porters` ≤ počet dospělých vsi,
  5. `returnDay < TOTAL_GAME_DAYS`.

  Prázdné `give` i `wants` jsou dovolené (výprava „na pivo“).

- `departMarket` (na kopii):
  - odebere `give` (`addGood(−)`, koně `takeHorses`),
  - `trade ??= { expeditions: [], nextId: 1 }`,
  - přidá `TradeExpedition`:
    - `{ id, kind: 'market', direction: target.firstStep, trailId: −1, startedDay: departDay, give, get: {} }`,
    - `porters`, `carts` (id vozů), `days = 2 × travel + stay`, `cost = porters × days`, `done: 0`,
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

- [ ] **Step 1: Testy** – `market-trip.test.ts`:

```ts
expect([1, 2, 3].map(marketTravelDays)).toEqual([0, 1, 2]);
expect(marketCrew({ grain: 600 }, { cows: 1 }, [])).toEqual({ porters: 24, carts: 0 });
expect(marketCrew({ grain: 600 }, { cows: 1 }, ['four-wheel'])).toEqual({ porters: 3, carts: 1 });
expect(marketCrew({ logs: 3 }, {}, [])).toEqual({ porters: 6, carts: 0 });
expect(marketCrew({ stone: 1 }, {}, [])).toBeNull();
expect(marketCrew({}, {}, [])).toEqual({ porters: 1, carts: 0 });
// den D, sousední mapa, pobyt 1 → departDay D+1, arriveDay D+1, returnDay D+2; 3 políčka, pobyt 2 → D+3, D+7
// důvody: pobyt 0, 9 krav při 3 na prodej, kámen bez vozu, 30 nosičů při 12 dospělých, returnDay za koncem světa
// departMarket: zásoby − give, výprava 'market' s klíčem, outbox [příjezd D+1], kronika 'market-departed'
expect(expeditionLaborNeed(after, D + 1)).toBe(porters);
expect(expeditionLaborNeed(after, D + 2)).toBe(0);
// vůz je pryč do returnDay (cartsAway), pak doma i bez výsledku (marketTripsDay)
// applyMarketResult: zásoby + bought + unsold, koně do ohrady, výprava pryč, news s cenami; bez výpravy zboží přibude
```

`market-two-villages.test.ts` (markets.md – Co se ověří bod 2 bez kupců). Vsi H a M z přípravků, M jako v Úloze 3, H s obilím, vozem a voly. Den D v červnu, žádná žeň ani porážka:

```ts
const sent = departMarket(h, D, { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 }, target);
const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
const h1 = advanceVillage(withoutOutbox(sent.state), D + 2, null, null, asEvents(m1.outbox!));
const h0 = advanceVillage(h, D + 2);
const m0 = advanceVillage(m, D + 1); // kontrolní běhy bez výpravy
// v součtu nic nevznikne ani nezmizí
expect(h1.storesKg - h0.storesKg + (m1.storesKg - m0.storesKg)).toBeCloseTo(0, 6);
expect(cows(h1) - cows(h0) + (cows(m1) - cows(m0))).toBe(0);
expect(cows(h1) - cows(h0)).toBe(1);
expect(h1.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
expect(m1.market!.prices.cows!).toBeLessThan(40); // cena
expect(h1.news![0]).toMatchObject({ villageId: 'm', prices: m1.market!.prices });
// druhý případ: 2 políčka – příjezd D+2, výsledek D+4, lidé pryč D+1 až D+3
```

- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/domain/village/trade` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady a `nice -n 19 npm run test:slow` – zlaté otisky beze změny.
- [ ] **Step 5: Commit** `feat(game): výprava na trh – odchod, lidé a vozy pryč, výsledek domů; test dvou vsí` (`Refs #11`).

### Task 5: Pošta mezi vsemi – doručení a zaniklý hostitel (Opus)

**Files:**

- Create: `packages/game/src/application/village-mail.ts`
- Modify: `application/shipments.ts` – exportovat `stepToward`, `placeOf`, `sleeps`, `crossesIsolation` (beze změny chování)
- Modify: `application/advance-world.ts` – v `advancePlayer` po `loadVillage` každé dopočtené vsi `deliverVillageMailSafely`, ve stejném `tryRun` jako odchody správce
- Modify: `application/dynasty-for-village.ts`, `application/advance-dynasty.ts` – vedle `settleStewardDeparturesSafely`
- Modify: `application/index.ts`
- Modify: `docs/code/village-core.md` (Schránka vsi – odchozí schránka), `docs/code/worker.md` (doručení pošty po dopočtu), `docs/code/village-trade.md`
- Test: `application/__tests__/village-mail.test.ts`, `application/__tests__/advance-world.test.ts` (in-memory jako `shipments.test.ts`: `in-memory-villages.ts`, `in-memory-inbox.ts`, `in-memory-settlements.ts`)

**Interfaces:**

- Consumes: Úlohy 3–4 (`VillageMail`, `MarketResult`, `MarketArrival`, `marketResultRef`, `marketArrivalRef`, `TradeExpedition.market`).
- Produces:

```ts
export interface VillageMailDeps {
  villages: VillageRepository;
  settlements: Pick<SettlementRepository, 'find'>;
}
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
   - Cílová ves neexistuje:
     - příjezd se změní ve výsledek `returned` se vším do schránky V,
     - výsledek pro zmizelou domovskou ves se zahodí.
2. Zapsané a zahozené `ref` z `outbox` smaže: `villages.find` + `villages.save(id, state, version)`, při konfliktu verze znovu, nejvýš `MAIL_ATTEMPTS = 5`. Prázdný `outbox` se ze stavu smaže celý.
3. Prochází výpravy V s `kind === 'market'` a `V.state.lastDay ≥ market.returnDay`. Pro každou načte hostitele M:
   - a. `M.state.outbox` má zprávu `marketResultRef(key)` → zapíše ji (`post`, duplicita se zahodí).
   - b. Jinak, je-li M pryč (`sleeps(M)`, `placeOf` null nebo M chybí):
     - příjezd je nepoužitý (ve `V.state.outbox`, nebo v `inbox.pending(M, M.lastDay, FAR_DAY)`) → do schránky V výsledek `{ key, sold: {}, bought: {}, unsold: arrival.goods, horses: arrival.horses, returned: true }`,
     - jinak je-li v `M.state.market.visitors` návštěvník s `key` → výsledek z toho, co drží (`unsold` = `goods`, `horses` + `boughtHorses`, `sold`, `bought`, `returned: true`).

     Vždy s `ref = marketResultRef(key)` a `day = V.lastDay + 1`.

   - c. Živý hostitel bez výsledku znamená čekat.

- [ ] **Step 1: Testy** (dva hráči, H a M na sousedních políčkách, přípravky jádra):
  - Kolo tam a zpět: `departMarket` a uložení H, `deliverVillageMail(H)`, `loadVillage(M, D + 1)`, `deliverVillageMail(M)`, `loadVillage(H, D + 2)`:
    - H má krávu a M obilí,
    - `outbox` obou vsí je pryč,
    - druhé `deliverVillageMail` obou nic nezapíše (vrátí 0).
  - Pád po uložení H: `deliverVillageMail` se nezavolá. `advancePlayer` hráče H příjezd doručí a výsledek dojde jako v předchozím testu.
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
- Modify: `application/rights.ts` (`sendMarketExpedition: 'trade'` v mapě akcí), `application/index.ts`
- Modify: `docs/code/village-trade.md` (oddíl „Přehled vsí“), `docs/code/world.md` (odkaz z Adresáře rodů – co je veřejné se nemění)
- Test: `application/__tests__/market.test.ts`, `application/__tests__/rights.test.ts`

**Interfaces:**

- Consumes:
  - Úloha 4: `departMarket`, `marketTravelDays`, `MarketOrder`, `MarketTarget`,
  - Úloha 5: `deliverVillageMailSafely`, `placeOf`, `stepToward`, `sleeps`, `settlementCell`, `crossesIsolation` (export z `shipments.ts`),
  - existující: `KnowledgeRepository.knownCellsOf` / `of`, `SettlementRepository.listActive` / `holderAt` / `find`, `HouseRepository.activeOf`, `WarRepository.activeBetween`, `updateLivingVillage`.
- Produces:

```ts
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

- `MarketDeps` = `VillageMailDeps & { houses; knowledge; landscapes }`, skládá se jako u ostatních akcí vsi.
- `marketOverview`:
  - zdroje a vyloučení podle Rozhodnutí 7,
  - bez domovské vsi a bez archivovaných sídel, každá ves jednou,
  - řazení podle `cells`, pak jména,
  - `null` = hráč ves neřídí.
- `sendMarketExpedition`:
  - cíl musí být v přehledu a bez `blocked`, jinak vrátí důvod,
  - `cells` a `firstStep` z políček sídel,
  - `updateLivingVillage(H, today, landscape, (s) => departMarket(s, today, order, target))`,
  - pak `deliverVillageMailSafely(deps, H)`.

  Volá se jako ostatní akce vsi pod zámkem hráče.

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
    - `rights`: hráč bez práva `trade` ve vsi seniorátu je odmítnut.
- [ ] **Step 2: Spustit** `npx vitest run packages/game/src/application/__tests__/market.test.ts packages/game/src/application/__tests__/rights.test.ts` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(game): přehled známých vsí a odeslání výpravy na trh` (`Refs #11`).

### Task 7: Web – akce, pohledy a karavana (Sonnet)

**Files:**

- Create: `apps/web/app/game/actions/market.ts` (`'use server'`: `getMarketOverview`, `sendMarketExpedition`), re-export v `app/game/actions.ts`
- Create: `apps/web/lib/market.ts` (`marketOverviewForPlayer`, `sendMarketExpeditionForPlayer` – vzor smazaného `sendExpeditionForPlayer` v `b4f8dadc:apps/web/lib/village.ts`), `apps/web/lib/market-view.ts`
- Modify: `apps/web/lib/village-input.ts` (`parseMarketExpeditionInput` – celá nezáporná čísla, kg zboží celé kg, `stayDays` celé), `apps/web/lib/manor-view.ts` (`VillageManor.market`), `apps/web/lib/caravan-view.ts` (`'market'` jako `'shipment'` – ke kraji ve směru `destination.firstStep`, tam s `give`, zpět nosiči), `apps/web/lib/village-notices.ts` (upozornění k novým kronikám, chce-li je kompilátor), `components/game/village-game/village-commands.ts` (příkaz pro panel)
- Modify: `docs/code/web-ui.md` (Rozložení server actions – `market.ts`; oddíl „Trh v rozhraní – akce a pohledy“)
- Test: `apps/web/lib/__tests__/market-view.test.ts`, `village-input.test.ts`, `caravan-view` test

**Interfaces:**

- Consumes: Úloha 6 (`marketOverview`, `sendMarketExpedition`, `MarketVillage`), Úloha 4 (`marketCrew`, `marketTravelDays`, důvody `MARKET_*`).
- Produces:

```ts
export interface MarketTripView {
  key: string; villageName: string;
  phase: 'out' | 'market' | 'back' | 'waiting'; // day < arriveDay | < arriveDay + stay | < returnDay | čeká na zboží
  daysLeft: number; // max(0, returnDay − day)
}
export function marketTripViews(state: VillageState, day: number): MarketTripView[];
export interface MarketSelection { give: TradeGoods; wants: TradeGoods; stayDays: number }
export interface MarketPreview { porters: number; carts: number; awayDays: number; reason: string | null }
/** Táž kontrola jako server (pořadí a texty z jádra): pobyt, sklad (`stock`), vozy (`carts`), dospělí (`adults`). */
export function marketPreview(sel: MarketSelection, manor: VillageManor['market'], cells: number): MarketPreview;
// manor-view.ts
market: { trips: MarketTripView[]; stock: TradeGoods; carts: CartKind[]; adults: number };
// actions/market.ts
export async function getMarketOverview(input: { villageId: string }): Promise<MarketVillage[] | { error: string }>;
export async function sendMarketExpedition(input: unknown): Promise<{ ok: true } | { ok: false; reason: string }>;
```

- [ ] **Step 1: Testy:**
  - `marketTripViews` – čtyři fáze a `daysLeft`.
  - `marketPreview` – nosiči a vozy jako `marketCrew`, `awayDays = 2 × travel + stay` a důvody shodné se serverem (pobyt 0, víc než sklad, kámen bez vozu, málo dospělých).
  - `parseMarketExpeditionInput` – odmítne záporná čísla, desetiny kusů a neznámé zboží.
  - `sceneExpeditions` – výprava `'market'` jde ke kraji ve směru `firstStep`.
  - Kronika – čtyři texty z Úloh 3–4 jsou v testech kroniky.
- [ ] **Step 2: Spustit** `npx vitest run apps/web/lib/__tests__` – FAIL.
- [ ] **Step 3: Implementovat** podle Interfaces.
- [ ] **Step 4: Spustit** – PASS. Pak celé sady.
- [ ] **Step 5: Commit** `feat(web): akce a pohledy trhu – přehled vsí, výpravy na cestě, karavana` (`Refs #11`).

### Task 8: Web – panel Trh a e2e (Sonnet)

**Files:**

- Create: `apps/web/components/game/hud/MarketPanel.tsx` (+ `hud/__tests__/MarketPanel.test.tsx`), `apps/web/e2e/market.spec.ts`
- Modify: `hud/ManorPanel.tsx` (tlačítko `manor-market` s ikonou `icons/build/obchod.png`, Tooltip „Obchod“, zakázané bez práva `trade` jako dřív – `useRightDenied`), `village-game/use-panels.ts` (otevření a zavření; přehled se načte `getMarketOverview` jen při otevření panelu, jako seznam známých map), `VillageGame.tsx` (vykreslení)
- Modify: `docs/code/web-ui.md` (oddíl „Panel Trh“)

**Interfaces:**

- Consumes: Úloha 7 (`getMarketOverview`, `sendMarketExpedition`, `marketPreview`, `MarketTripView`, `VillageManor.market`), `TRADE_GOOD_NAMES`, `goodsText` (`lib/trade-names.ts`).
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
  - nový oddíl „Rozhodnutí plánu 2“: body 1–9 tohoto plánu jako „návrh Clauda“ a všechna čísla `MARKET` s odkazem,
  - Co se ověří bod 2: „**Ověřeno <datum>** bez kupců a mincí – `market-two-villages.test.ts` …“.
- Modify: `docs/design/neighbours.md` – Stav jednou větou: body 2–5 (výpis souseda, nabídka, platba, přesun zboží) nahradil trh ve vsi (markets.md, plán 2).
- Modify: `CLAUDE.md` – v mapě kódu řádek `village-trade.md` doplnit o „trh ve vsi, výprava na trh, přehled vsí“.
- [ ] **Step 1: Dokumenty** podle Files. `npm run check:docs` – PASS a `grep -n "koordinátor\|za Martina" docs/design/markets.md` nic nevrátí.
- [ ] **Step 2: Celé e2e** – `npm run test:e2e` (projekty chromium i worker, sériově) – PASS.
- [ ] **Step 3:** Celé sady z Global Constraints, `nice -n 19 npm run test:slow` (zlaté otisky beze změny) a `npm run test:db` – PASS.
- [ ] **Step 4: Commit** `docs: trh bez mincí v návrzích – rozhodnutí plánu 2, ověření dvou vsí` (`Refs #11`).

## Otázka na Martina

Žádná. Co návrh neurčuje (model ceny, zápočet, doba cesty, oběh mezi vsemi, rozhraní, převod), rozhoduje plán jako „návrh Clauda“ v Rozhodnutích 1–9. Následky, které hráč pocítí: řídký trh bez mincí (Rozhodnutí 4), klády a kámen hostitele na prodej celé (Rozhodnutí 5), zboží od pozdního hostitele přijde po lidech (Rozhodnutí 6).
