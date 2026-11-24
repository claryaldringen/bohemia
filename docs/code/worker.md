# Worker (`apps/worker`)

Samostatný Node proces, který průběžně dopočítává vsi hráčů, i když nikdo není online. Je to
vstupní bod (composition root) jako web – žádná herní logika, jen plánování; práci dělá use-case
`advanceWorldStep` (`packages/game/src/application/advance-world.ts`, krok světa viz
`docs/code/web-ui.md`). Web a worker se vylučují zámkem hráče v Postgresu (`PlayerLock`).

## Spuštění

- `npm run dev` – turbo pustí web (`:3010`) i worker (`tsx watch`, restart při změně kódu).
- `npm run dev:web` – jen web; `npm run worker` – jen worker (`tsx src/main.ts`).
- Konfigurace z prostředí, vzor `apps/worker/.env.example`. `DATABASE_URL`, `WORLD_START`,
  `WORLD_END` se čtou i z `apps/web/.env.local` (proměnné z prostředí mají přednost) – web a worker
  musí mít stejnou databázi i stejný „dnešek“. `WORKER_STEP_DAYS` (10), `WORKER_LIMIT` (50),
  `WORKER_IDLE_MS` (5000), `WORKER_PAUSE_MS` (20), `WORKER_LANDSCAPES` (128),
  `WORKER_CAMPAIGN_MS` (1000 – perioda smyčky tažení), `WORKER_LOG` (`info` / `debug`).
- Produkce (PM2 vedle Next, bez Caddy) se řeší až s `docs/deployment.md`.

## Soubory

Zápisy workeru (stav vsi, bod výpravy a tažení, upozornění) oznamují triggery v databázi, worker pro to nic nevolá (`docs/code/server-events.md` – Oznámení v databázi).

- `src/main.ts` – skládání: pool hlavní a pool zámků (`WORKER_LOCK_POOL_SIZE` = 2),
  `createGameDeps` (obsahuje i `queue` = `createWorldQueue`), signály, zavření poolů.
- `src/loop.ts` – `runLoop(deps, options, signal)`: kolo `advanceWorldStep` → při práci pauza
  `pauseMs`, při `idle` spánek `nextWakeMs`; krok dostane okamžik kola `now` (Uspání nečinných) (drží-li tažení vsi – `WorldStep.held` – nejvýš
  `HELD_WAKE_MS` = 250 ms, viz Přednostní vsi); souhrn do logu jednou za minutu; chyba kola ani jednoho
  hráče smyčku nezastaví. Hodiny, spánek i krok se v testech nahrazují (`LoopDeps`). Mezi koly pouští
  `runWorldTasks` (kredity nástupnictví, `world.md`; obnova zásilek, Odvody, války, nováčci – los po
  týdnu pod zámkem hráče; správce za nepřítomného hráče a vypršení jednání – členy `stewards`
  a `negotiationExpiry`, `vassalage.md` – Správce za nepřítomného hráče; jídlo
  domény po žních `sendDomainFood` – `vassalage.md`, Jídlo domény – krok světa; člen `domainFood`
  skládá `main.ts`: `loadVillage` s dopočtem do dneška a uložením, `gameDeps.domainFood`, mapa
  pokusů `attempts` drží proces; návrat uprchlíků za správce a NPC rody `returnStewardRefugees` –
  člen `refugees`, `war.md` – Varování: návrat; nakonec účinky přijatých jednání, po kterých web
  spadl – člen `acceptances` (`acceptanceDeps` z `packages/server` jako přijetí ve webu: pomoc,
  dar odúmrti, výkupné, postoupení, dialogy; `log` pro vyčerpané schránky),
  `deliverPendingAcceptances`, `vassalage.md` – Přijetí jednání a schránka účinků) nejvýš jednou
  za minutu (`WORLD_TASKS_MS`, podle hodin `deps.now`); jejich chyba kolo nezastaví. Schránky mají
  v `runWorldTasks` vlastní `try/catch`: chyba dřívější úlohy jejich doručení nezastaví a naopak,
  první chyba se vyhodí až na konci; dřívější úlohy dál jdou za sebou (na pořadí závisí).
- **Schránka účinků přijetí – čísla (návrh Clauda, `negotiate.ts`):** nájem
  `ACCEPTANCE_OUTBOX_LEASE_MS` = 60 s (web ho drží od zápisu, adaptér ho během účinků obnovuje
  každých 20 s; po pádu webu vezme schránku worker za 60–120 s); odklad po výjimce
  `acceptanceOutboxRetryMs` = 1, 2, 4… min, nejvýš 1 h; po `ACCEPTANCE_OUTBOX_MAX_ATTEMPTS` = 10
  výjimkách (≈ 4 h) se schránka nebere, zůstane v `negotiation_outbox` (`attempts`, `last_error`)
  pro ruční zásah a do logu jde varování „schránka účinků jednání …: 10. pokus selhal“; nejvýš 50
  schránek za krok, napřed s nejméně pokusy.
- `src/campaign-loop.ts` – `runCampaignLoop(deps, { campaignMs }, signal)`: **smyčka tažení**
  vedle smyčky vsí (`main.ts` je pouští spolu přes `Promise.all`, signál ukončí obě). Kolo
  `stepCampaigns` (`docs/code/war.md` – Tažení po taktech) každých `campaignMs` od začátku kola;
  chyba jednoho tažení (`failed` ve výsledku) ani celého kola (např. chybějící tabulka před
  migrací) smyčku nezastaví, stejná chyba se do logu opakuje nejvýš jednou za minutu. Bez tažení a výjezdů
  je kolo dva dotazy (`active()` tažení a `active()` výjezdů). Zámek tažení má vlastní pool (`CAMPAIGN_LOCK_POOL_SIZE` = 2), vsi
  tažení jdou úložištěm bez paměti dávky (`createVillageRepository`), mapy políček
  `createCampaignCells` (`packages/server`) – krajiny prázdných políček v LRU, které worker před
  každým kolem zvětší podle map v paměti tažení i výjezdů (`reserve(cellsInNeed(…))`, nejméně
  `CAMPAIGN_CELL_CACHE_SIZE` = 16 a k tomu 16 volných; Výkon – Mapy prázdných políček). Paměť
  tažení napříč koly (`newCampaignMemory` – poslední
  spočtený stav, kontrolní bod podle verze, mapy a vsi minulého kola a mřížky pochodu, Výkon –
  Tažení) drží proces; restart ji zahodí (počítá od bodu). Po výpočtu kola tažení odpoví varovaným
  vsím na přítomnost hráče záměrem `alarm-presence` (`answerPresence` s portem
  `createPresenceRepository` – `docs/code/war.md`, Hráč ve vsi a mimo ni: Odpověď workeru).
  **Výjezdy vojvody** (`docs/code/journey.md`
  – Worker): po `stepCampaigns` pustí kolo v témže okamžiku `stepJourneys` (`CampaignLoopDeps.journeys`)
  se stejným zámkem, mapami a vsemi, úložištěm `gameDeps.journeys`, dotazem války `gameDeps.atWar`
  a **vlastní** pamětí (`newCampaignMemory<JourneyState>()` – konec kola zapomene, co mezi jeho id
  není). Chyba kola tažení výjezdy nezastaví a naopak; chyby výjezdů se hlásí zvlášť („chyba
  výjezdu …“, „kolo výjezdů selhalo: …“) – stejná chyba tažení i výjezdů nejvýš jednou za minutu,
  i když se chyby obou kol střídají.
- `src/wake.ts` – `nextWakeMs` (do 1 s po začátku dalšího herního dne, nejvýš `idleMs`) a
  `SkipTable` (odklady: zámek ve webu 2 s, chyba 1 min zdvojováním do 15 min; use-case dostane
  množinu `skip`).
- `src/config.ts`, `src/log.ts` – env → konfigurace (chyby česky), řádky `[worker] HH:MM:SS – …`.
- `src/signals.ts` – `signalHandler`: první signál zastaví smyčku, opakovaný ukončí proces hned.

## Ukončení

První SIGINT / SIGTERM dokončí rozpočítanou dávku (hráče; `shouldStop` se kontroluje mezi hráči kola), zavře pooly (zámky padnou se spojením) a vypíše
„worker skončil“; druhý signál skončí hned. Jedno Ctrl + C v terminálu přijde víckrát (dostane ho
celá skupina procesů a `tsx` ho přepošle) – signál do `REPEATED_SIGNAL_MS` (1 s) po prvním patří
témuž stisku a ignoruje se. Pod `npm run dev` ukončuje dítě i `tsx watch`: na opakovaný signál ho
po chvíli zabije („Force killing…“) – ověřeno 1. 11. 2026, worker stihl dávku dokončit a vypsat
„worker skončil“; nedokončená dávka by se jen zahodila (zámek padne se spojením).

## Přednostní vsi (bariéra tažení)

Plán 2026-11-03 – Úloha 6.7; `docs/code/war.md` – Bariéra dopočtu. Ves, u které stojí tažení
(skupina na mapě vsi nebo políčko od ní), se dopočítá jen do meze tažení a tažení čeká na její
předchozí den – worker ji proto bere **přednostně**:

- `advanceWorldStep` se na začátku kola zeptá `WorldQueue.priorityVillages()` (adaptér
  `villagesNearCampaigns` – políčka skupin aktivních bodů tažení i výjezdů vojvody × sídla do políčka
  od nich) a jejich mezí
  `VillageHolds.limitOf`; meze předá `queue.behind(worldDay, limit, holds)`: ves na své mezi není
  pozadu (žádné kolo naprázdno, nezabírá místo ve frontě), hráč s přednostní vsí pod mezí jde první,
  pak podle zpoždění. Bez tažení stejný dotaz i pořadí jako dřív.
- `WorldStep.held` = počet přednostních vsí; nic pozadu a `held > 0` → smyčka spí jen `HELD_WAKE_MS`
  (mez roste s taktem tažení – tažení uloží bod hned, když na ves čeká –, ne s herním dnem).
- Výjezd vojvody (`docs/code/journey.md` – Úložiště) drží vsi stejně jako tažení: skupina na mapě vsi
  nebo políčko od ní, mez `throughDay` bodu, nedoručené události; varování nemá.
- Vsi bez tažení se dopočítají jako dřív (bariéra je nenačte – `limitOf` je nevrátí).

## Uspání nečinných

absence.md – Zátěž serveru (Martin 8. 11. 2026: „A“). Vsi hráče, který **nehraje déle než
`ABSENCE.sleepDays` (3) skutečné dny** (`domain/world/rules-world.ts`), spí: worker je počítá
s **nejnižší předností** – jen v kole, kdy nikdo vzhůru (mimo odložené) nezaostává (návrh Clauda 8. 11. 2026, čeká na Martina). Server tak šetří práci jen při nedostatku kapacity; s volnou
kapacitou jsou spící vsi aktuální a návrat je rychlý. Co worker nestihl, dopočítá dotek. Výsledek
je díky determinismu stejný (test „uspaná ves po dotyku = průběžně počítaná“
v `advance-world.test.ts`, i se zásilkou ve schránce).

- **Kdo je nečinný:** aktivní dny hráče (`player_activity`, datum v Europe/Prague – táž tabulka
  jako „začal hrát“ pozvaného). `awakeSince(now)` (`application/activity.ts`) = datum před 3 dny;
  hráč, jehož poslední aktivní den je dřív (nebo žádný), spí. Přesnost je den – vsi usnou po 3 až
  4 dnech od poslední hry. Web zapisuje aktivní den při vstupu do hry
  (`gameEntryForPlayer`) i při každé akci a dotazu na ves (`playerId()` v `app/game/actions.ts` →
  `notePlayerActive`, do databáze nejvýš jednou za den a proces) – hráč s otevřenou hrou neusne.
- **Fronta:** smyčka předá `advanceWorldStep` okamžik kola (`now`). Use-case se ptá
  `WorldQueue.behind` dvakrát: napřed `{ awakeSince, asleep: false }` (jen vzhůru), a teprve když
  z toho po odkladech nikdo nezbude, `asleep: true` (jen spící; `WorldStep.asleep` = jejich počet
  v kole). Adaptér: `EXISTS` nad primárním klíčem `player_activity`. Vzhůru je i hráč
  s **přednostní vsí pod mezí** (tažení u ní čeká – dotek nájezdem, Přednostní vsi) – jde první jako
  dřív – a hráč, jehož ves živě spravuje **aktivní hráč** (`stewardship`, vassalage.md – Hráč jako
  správce cizí vsi). Bez `now` (testy, `measure-absence`) se spící nerozlišují.
- **Dotyky** (když worker spící ves nestihl; všechny dopočítají ves do dneška, nebo čekají ve
  schránce): návrat hráče – web
  dopočte zobrazenou a zaostalé vsi (`lagsBehindWorker`, village-core.md – Dopočet) a zapsaný
  aktivní den ho probudí; obchod, dávky, výměna lidí, jídlo domény – zásilky přes schránku vsi
  (`inbox.post`, použijí se v den příjezdu při dopočtu); jídlo domény, roční potvrzení dávek,
  svolání (i správce za nepřítomného – `answerAbsentLevies`, `answerAbsentSummons`, testy
  v `annual-levies.test.ts` a `summons.test.ts`), jednání, zajatci, ochrana – `prepareVillage` (`loadVillage` s uložením) před čtením
  stavu; odúmrť – `updateVillage`; nájezd – přednostní ves (výš). Smrt hlavy spícího rodu (a s ní
  nástupnictví – `settleSuccessionOf` po dávce) se odhalí až dopočtem při dotyku.
- **Omezení (jen když worker nestíhá):** pohled jiného hráče na rod (`house-panel`, adresář rodů)
  čte uložené souhrny (`digestsOf`) – u nedopočtené spící vsi ze dne, kam ji worker dostal.
  Nedopočtenou ves dopočítá web při návratu v požadavku: ves velikosti Vlkova (39 lidí, měření
  z 9. 11. 2026 – village-core.md, Výkon dopočtu, kolo 6) první rok vcelku ≈ 8,7 s (≈ 24 ms na
  herní den, se zahřátím mezipamětí), další roky 5,0–6,5 s (≈ 14–18 ms na den), tj. za 3 skutečné
  dny (≈ 8,2 herního roku) ≈ 45–55 s na ves; nájezd čeká, než ji worker dožene.

## Pošta mezi vsemi

markets.md – Rozhodnutí plánu 2, bod 6; `application/village-mail.ts` (village-core.md – Schránka
vsi, village-trade.md – Pošta mezi vsemi). Ves zprávy pro jiné vsi (příjezd výpravy na trh, výsledek
trhu) nechá v odchozí schránce `outbox`; `advancePlayer` ji doručí pod zámkem hráče:

- **Dopočtená ves:** po `loadVillage` ve stejném `tryRun` jako odchody správce, má-li poštu
  (`hasVillageMail` – stav už je v paměti, ves bez pošty nestojí ani dotaz) – i bez odchodů správce.
- **Ves, kterou už dopočítal web** (`stamp.lastDay ≥ cíl` – přeskočí se): `deliverVillageMailSafely`
  ve vlastním `tryRun` – načte ves sama (jeden `find`; otisk poštu neprozradí), bez pošty nic
  neuloží (verze přeskočené vsi beze změny). Pád webu mezi uložením vsi a doručením tak dožene
  příští dávka hráče. Do `PlayerStep.villages` ani `days` se nepočítá; zámek drží web → `busy`.
- **Kdy:** hráče bere fronta, jen když má ves pozadu – ves na dnešku bez jiné vsi pozadu se
  doručí nejpozději s dalším herním dnem (≈ 86 s). Výprava po termínu u hostitele pozadu čeká
  (`hasVillageMail` platí, dokud výsledek nepřijde – každá dávka hráče se na hostitele podívá).
- Chyba doručení (`deliverVillageMailSafely` – log) dávku nezastaví; zprávy zůstanou v `outbox`.
- **Okolí vsi** (markets.md – Rozhodnutí plánu 3, bod 1; `application/nearby.ts`, village-trade.md
  – Okolí vsi) worker zvlášť neobnovuje: snímek sousedů v pevné dny obnovy (`nearbyDays` – dny
  dělitelné `NEARBY_REFRESH_DAYS`) zapíše do schránky sám dopočet (`updateVillage` přes
  `villages.nearby`) před dopočtem přes den obnovy – ve workeru, webu i akci stejně. Ves dopočtená
  webem se kvůli okolí nečte; dávka, která den obnovy přejde, načte ves jednou navíc (nový pokus
  po zápisu).

## Výjimky a omezení

- **Sousedé na mapě s víc vsemi:** ve workeru vidí ves při dávce sousedy tak staré, jak jsou uložení
  (až o dávku starší); ves počítaná po sousedovi ho vidí dál než sebe. Platí „výsledek na kouscích
  nezávisí“ jen pro ves samotnou na mapě. Web dopočte sousedy do dneška (`mustAdvanceNow`).
- **Obsah okolí vsi** (`nearby` – village-trade.md, Okolí vsi) je stav vsí na sousedních mapách
  v okamžiku zápisu (jména, které vsi spí) – mezivesnická výjimka jako pošta do vsi, která je napřed.
  Den snímku je pevný (den obnovy), takže ves samotná na mapě (i se sousedy na jiných mapách, kteří
  se během dopočtu nezmění) je po kouscích stejná jako vcelku.
- **Konec rodu ve workeru:** `closeDynastyDay` se zjišťuje ke dni dávky `T`, ne ke dni hráče –
  výjimka z „po kouscích“ vedle převodů `withPenGrace` / `withThreshingGrace`. Konec hry je stejný.
- **Chyba jedné vsi** nezastaví ostatní vsi hráče; hráč se označí `failed` (odklad) až na konci.
- Hlavní pool má posluchač `error` (restart Postgresu worker neshodí); web čeká na zámek v DB
  nejvýš `WEB_LOCK_WAIT_MS` (45 s), pak chyba.

## Testy

- `apps/worker/src/__tests__` – konfigurace, `nextWakeMs` / `SkipTable`, smyčka s falešnými
  hodinami, `signalHandler`, smyčka tažení (`campaign-loop.test.ts` – perioda, chyba tažení i kola
  smyčku nezastaví, opakovaná chyba jednou; výjezdy v okamžiku kola po tažení, střídající se chyby
  kol tažení a výjezdů jednou každá).
- **Souběh web × worker** (`packages/server/src/__tests__/web-worker-race.db.test.ts`, `test:db`
  – kořenový `test:db` pouští `@bohemia/db` a pak `@bohemia/server`): dva „procesy“ s vlastními
  pooly (hlavní i zámků – advisory zámek patří spojení) nad `bohemia_test`, 3 hráči / 4 vsi, každá
  ves sama na mapě (ruční krajina z testů jádra). Hodiny +1 den za takt (12 ms), 200 dní. Worker točí
  `advanceWorldStep` (dávka 5 dní), web ve třech smyčkách s frontou hráče v procesu (jako
  `exclusive`) a `PlayerLock.run` dělá `dynastyForVillage` a akce (pole, přejmenování), den čte až
  pod zámkem. Záznamník uložení (den před → po podle verze) ověří: uložené úseky na sebe navazují,
  **se zámkem žádný konflikt verze** a každý den vsi spočítaný právě jednou, worker narazil na zámek
  webu (`busy`), a konečný stav (JSON se seřazenými klíči – `jsonb` pořadí mění) i jméno = dopočet
  jedním procesem v paměti se stejnými akcemi ve stejné dny. Druhý běh bez zámku webu: konflikty
  verzí nastanou (≈ 130, dny se počítají znovu), výsledek je přesto stejný – pojistka verzí.
- **e2e s workerem** (`apps/web/e2e/worker.spec.ts`, projekt Playwright `worker`; samotný
  `npm run test:e2e:worker`, celé `npm run test:e2e` pouští oba projekty): spec pustí worker
  (`node --import tsx src/main.ts`, prostředí `E2E_ENV` jako web, `WORKER_IDLE_MS` 300) nad
  vyprázdněnou `bohemia_test` (worker bere první hráče nejvíc pozadu – staří hráči jiných specifikací
  by ho zdrželi). Ves 30 dní pozadu (posun času hráče, stránka zavřená) worker dožene, `/game` ji
  otevře beze změny verze a staví dál (pole, přejmenování); ves na cestě se správcem a příjezdem
  v den odchodu worker sám založí a hráč na ni přepne v seznamu vsí. Na konci SIGTERM → kód 0,
  „worker skončil“, žádný advisory zámek. Projekt `chromium` (všechny ostatní specifikace) běží
  bez workeru – záložní cesta webu. Společné kroky vsi jsou v `e2e/village-helpers.ts`.

## Výkon (měření)

`apps/web/scripts/measure-absence.ts` (plán workeru – 7. Měření): rod s `--villages` kopiemi
Vlkova (2,6 MB JSON, vlastní sídlo každá), svět posunutý o `--days` (výchozí 1000 ≈ 1 skutečný
den), řízené hodiny. Měří skutečné serverové funkce webu (`villageViewForPlayer`,
`renameVillageForPlayer`) a `advanceWorldStep`. Databáze `bohemia_measure` (`--db bohemia_measure*`,
vytvoří se a zmigruje sama, vývojová `bohemia` se jen čte), `--scenarios A,B,C`, `--profile` =
nejdražší funkce otevření a akce.

```bash
cd apps/web && NODE_OPTIONS=--conditions=react-server nice npx tsx scripts/measure-absence.ts \
  --villages 1,5,20 --days 1000
```

Změřeno 1. 11. 2026 (M-série, 10 jader, jedno jádro na proces; čas na serveru bez sítě a
vykreslení). A = bez workeru (dnešní chování), B = worker dožene, pak +1 den a otevření / akce
(přejmenování), C = worker doběhl polovinu kol.

| scénář           | vsí |  dní | worker |  otevření |        akce |
| ---------------- | --: | ---: | -----: | --------: | ----------: |
| A bez workeru    |   1 | 1000 |      – |    21,7 s |      0,19 s |
| A bez workeru    |   5 | 1000 |      – |      94 s |      0,37 s |
| A bez workeru    |  20 | 1000 |      – |     441 s |       6,6 s |
| B s workerem     |   1 | 1000 |   33 s | 0,26 s OK |   0,18 s OK |
| B s workerem     |   5 | 1000 |  158 s |  1,4 s OK |  1,5 s MIMO |
| B s workerem     |  20 | 1000 |  673 s | 0,72 s OK | 1,10 s MIMO |
| C během dohánění |   1 | 1000 |   16 s |     8,2 s |           – |
| C během dohánění |   5 | 1000 |  257 s |      41 s |           – |
| C během dohánění |  20 | 1000 |  302 s |     156 s |           – |

Čistší opakování B (100 dní – čas B na délce nepřítomnosti nezávisí, běh jen sám na stroji,
mezipaměť webu zahřátá prvním pohledem): 1 vs. otevření 0,27 s / akce 0,19 s, 5 vsí 0,54 s /
0,66 s, 20 vsí 0,71 s / **1,24 s**. První pohled po startu serveru (studená mezipaměť krajiny
a vrstvy překážek) 0,6–1,0 s.

**Kapacita jádra:** 31–43 ms na herní den Vlkova → ≈ 2000–2700 vsí velikosti Vlkova na jedno
jádro workeru v reálném čase (1 den = 86,4 s); podíl generování krajin ve workeru ≈ 0 %
(mezipaměť 128). Plán odhadoval 3–4 tisíce – měřeno je méně, pořád o řád víc než rod do 20 vsí.

**Závěr:** otevření s workerem je v cíli (do 2 s) pro 1 / 5 / 20 vsí. **Akce přes 0,5 s od 5 vsí**
(0,66 s, 20 vsí 1,1–1,2 s). Bez workeru je otevření po dni nepřítomnosti nepoužitelné (22 s až
7 min) a během dohánění (C) web dopočítává, co worker nestihl – proto worker musí běžet.

**Kde je čas akce (profil `--profile`, 20 vsí):** téměř všechno je načtení stavů ostatních vsí
pro přepínač vsí (`villageListItem`): ≈ 0,5 s čekání na databázi (přenos 20 × 2,6 MB JSONB),
≈ 0,3 s parsování řádků (`_parseRowAsArray`), ≈ 0,1 s GC; samotné sestavení pohledu je zlomek.
Web načte všech 20 stavů po každé uložené verzi (worker ukládá každý herní den ≈ 86 s).
**Souhrn vsi (1. 11. 2026, plán – Doplnění):** cíl Martina z 31. 10. 2026 „**Otevření do 2 s,
akce do 0,5 s**“ splní malý souhrn vsi ve sloupci `village.digest` (migrace
`0010_village_digest` – `digest jsonb`, `digest_version integer`):

- **Co nese** (`VillageDigest`, `domain/village/core/digest.ts`, ≈ 300 B u Vlkova): den vsi, počet
  lidí, na cestě, hlad (`hungerLevel`), nouzový výmlat (`threshingStatus().emergency`), správce,
  fakta konce rodu (`LineFacts` – sleduje rod, muži rodu, `extinctDay` / `abandonedDay`), vstupy
  počasí roku (`weatherSeed`, z pohrom jen povodeň a vynucené počasí – ochrana dílů má u Vlkova
  120 kB) a poslední místní pohromu z kroniky (`LOCAL_DISASTER_KINDS`). Od verze 2 (5. 11. 2026, adresář rodů) i `publicLineMen` – muži rodu
  s číslem osoby, jménem a dnem narození (`PublicLineMan`); souhrn verze 1 se nepoužije
  (`isCurrentDigest`) a ves ho dostane při dalším uložení. Co závisí na dni pohledu
  (odhalené počasí roku), se počítá až v pohledu ze vstupů – položka přepínače je táž i pro dnešek
  o pár dní po dni vsi. Od verze 4 (8. 11. 2026, hradiště) i `domainReadyYear` (rok, kdy je ves po výmlatu a smí dát jídlo domény –
  `domainFoodReadyYear`, jinak null) a `food` (`{ growsKg, needsKg }` z `villageFoodBalance`, bez lidí nebo
  pole null); souhrn verze 3 se nepoužije a ves ho dostane při dalším uložení – migrace netřeba.
  `VILLAGE_DIGEST_VERSION` = tvar; jiný tvar se nepoužije.
- **Kdo ho píše:** adaptér (`createVillageRepository` – `create`, `add`, `addOnce`, `save`) ze
  stavu přes `villageDigest` (0,01 ms), s `digest_version` = nová `version`. Generovaný sloupec
  zvolen nebyl: pravidla hladu, výmlatu a mužů rodu jsou v jádru (TS) a v SQL by se musela
  opakovat. Cena zápisu to nerozhodlo – změřeno `UPDATE` 2,6 MB JSONB: bez dalších sloupců
  54–56 ms, se dvěma generovanými sloupci ze stavu 54–55 ms, se zapsaným souhrnem 53–54 ms
  (rozdíl v šumu); den vsi ve workeru 43–44 ms před i po.
- **Kdo ho čte:** `dynastyForVillage` – vsi **jiných map**, které nejsou víc než
  `WORKER_LAG_DAYS` pozadu, jen přes `digestsOf` (port `VillageRepository`, bez stavu); zobrazená
  ves a vsi téže mapy celé jako dřív. Souhrn platí jen při `digest_version = version` – zápis
  stavu mimo adaptér (e2e, ruční SQL) verzi zvýší a ves se načte celá; ves bez souhrnu (uložená
  před migrací) taky – souhrn dostane při dalším uložení (worker ≈ každý herní den). Konec hry ze
  souhrnů pozná `isGameOverOf`; když nastal, načtou se vsi celé a rozhodne se jako dřív.

Měřeno `--villages 1,5,20 --days 100 --scenarios B` (běh sám na stroji):

| vsí | otevření před | otevření po |   akce před |       akce po |
| --: | ------------: | ----------: | ----------: | ------------: |
|   1 |     0,26 s OK |   0,27 s OK |   0,18 s OK |     0,19 s OK |
|   5 |     0,34 s OK |   0,19 s OK |   0,44 s OK |     0,17 s OK |
|  20 |     0,72 s OK |   0,21 s OK | 1,08 s MIMO | **0,18 s OK** |

Akce i otevření jsou s workerem v cíli pro 1 / 5 / 20 vsí a na počtu vsí už skoro nezávisí.

### Mapy prázdných políček (závěrečná recenze výjezdu – Important 4)

Prázdné mapy (krajina z kostry světa a vrstva překážek, ≈ 250–350 ms a ≈ 2 MB na mapu) drží jedna
LRU v `createCampaignCells` pro tažení i výjezdy. Dřív měla pevných 16 míst a `computeWithLoads`
žádá `mapOf` v každém kole – víc než 16 map se skupinou znamenalo generovat všechny každou
sekundu znovu. Teď ji worker před kolem zvětší na počet map v paměti obou smyček
(`cellsInNeed` – políčka `CampaignNeeds.cells`) + 16 (`WorkerCampaignCells.reserve`; při menší
potřebě se zmenší zpět). Návrh Clauda: kapacita podle potřeby kola místo map v `CampaignMemory` –
`mapOf` dál čte držitele a vsi políčka každé kolo (nové sídlo na prázdném políčku, archiv), mezipaměť
drží jen krajinu prázdného políčka, čistou funkci seedu světa a políčka, takže výsledek se změnit
nemůže; paměť roste jen se skutečnou potřebou. Měření 14. 11. 2026 (skript ve scratchpadu,
skutečné `createCampaignCells` a `stepJourneys` s pamětí, 30 výjezdů na 30 různých prázdných mapách,
kola po 1 s): před – každé kolo 30 nových map, ≈ 8,0 s na kolo; po – kolo 1 (studené) 30 map
≈ 11,7 s, kolo 2 ještě 14 map (≈ 3,8 s – v prvním kole potřeba nebyla známá a LRU 16 map
zahodila), od kola 3 žádná mapa a 1–6 ms. Otisk stavů po 7 kolech je s mezipamětí i bez ní týž
(sha256 `96c7ccbb…`). Testy `packages/server/src/__tests__/campaign-cells.test.ts`,
`landscape-cache.test.ts` (`LruCache.resize`).

### Tažení (Úloha 6.17)

`apps/worker/scripts/measure-campaigns.ts` – v paměti (žádná databáze): 1 / 5 / 20 tažení × 60
mužů (3 skupiny, NPC velitel) na pochodu přes skutečné krajiny prázdných políček
(`emptyCellLandscape`), 5 tažení u opevněných vsí (palisáda z bodů kolem jádra, postoj bránit –
útočiště, prolamování) a 5 tažení na varované vsi („varování 5“ – správce NPC pošle posla a lidi
„se vším“ do hradiště o políčko dál; plán 2026-11-09, Úloha 11). Smyčka je skutečné `stepCampaigns` každých 250 ms nad porty v paměti
(kontrolní bod jako JSON – jsonb, bod po ≥ 40 taktech nebo s událostí) s pamětí workeru;
`--no-memory` = bez ní (každé kolo znovu od bodu – stav do 7. 11. 2026). „Otisk“ uložených bodů
musí být s pamětí i bez ní tentýž. `--ticks` (výchozí 480 = 2 min), `--profile` = podíl hledání
cesty (vzorky pod `marchPath` / `marchPathToEdge` / `worldRoute`) a mřížky.

```bash
nice npx tsx apps/worker/scripts/measure-campaigns.ts --ticks 480 --profile
nice npx tsx apps/worker/scripts/measure-campaigns.ts --ticks 480 --no-memory   # stav před
```

Změřeno 7. 11. 2026 (M-série, jedno jádro). „Jádro“ = podíl jednoho jádra smyčkou jako ve
workeru; „před“ = bez paměti workeru (`--no-memory`, stejné body i otisk).

| scénář                | tažení |   před |        po | cesta (A\*) | mřížka |
| --------------------- | -----: | -----: | --------: | ----------: | -----: |
| pochod                |      1 |  2,4 % |     0,4 % |        15 % |    0 % |
| pochod                |      5 | 10,5 % |     1,6 % |        13 % |    1 % |
| pochod                |     20 | 39,7 % | **4,4 %** |        13 % |    0 % |
| opevněné vsi (nájezd) |      5 | 16,2 % |     2,5 % |         0 % |    1 % |

**Cíl ≤ 25 % jádra pro 20 tažení je splněn (4,4 %).** Dřív byl čas v **opakování taktů od
kontrolního bodu**: bod se ukládá po 40 taktech, a než se uložil, každé kolo počítalo znovu od
něj (průměrně ≈ 20 taktů za kolo místo jednoho), u nájezdu ještě v **mřížce pochodu** mapy cíle
(`marchGrid` 18–20 %), která se stavěla v každém volání znovu. Oprava:

- **Paměť workeru** (`newCampaignMemory`, `StepCampaignsDeps.memory` – `apps/worker/src/main.ts`):
  poslední spočtený, ještě neuložený stav tažení (`CampaignMemo` – verze bodu z úložiště, dřív
  otisk = JSON jeho stavu; záměry do jeho taktu `seq@takt`). Další kolo pokračuje od něj, platí-li
  pro načtený bod i záměry
  a není-li za teď; jinak počítá od bodu jako dřív. Uložení bodu, `stale` i chyba paměť tažení
  zahodí, skončená tažení se zapomenou na konci kola. Výsledek je tentýž (po kouscích = vcelku);
  zápis bodu, `CampaignLock`, bariéra a `outbox` beze změny – bod se ukládá stejně často.
- **Mřížky pochodu napříč koly** (`MarchGridMemo` v `domain/war/march-grid.ts`,
  `CampaignWorld.grids`): klíč = identita krajiny, překážek a stavu vsi, os pokračování a den
  (mapa bez vsi na dni nezávisí – den 0, staví se jednou; závěrečná revize A – M3) – čtyři naposledy
  použité dny, vyhazuje se nejdéle nepoužitý (ne nejmenší: tažení o den pozadu by svou mřížku
  stavělo při každém dotazu – měřeno 13. 11. 2026, dvě tažení o den posunutá: 205 → 6 staveb mřížky
  na 800 dotazů, 1,2 s → 36 ms).
  Paměť workeru dá vsi téže verze a jména tentýž objekt stavu (`recallVillage`; vsi, které kolo
  nenačetlo, zapomene), krajiny a mapy prázdných políček jsou sdílené (`createCampaignCells`).

Zbývá **kopie celého stavu v každém taktu** (`structuredClone` v `campaignTick`, ≈ 45 % vzorků)
a čtení bodu z JSON (≈ 35 %). Kopii na hranici kola **neodstraňujeme** (návrh Clauda): cíl je
splněn s rezervou 5×, zisk by byl ≈ 2 % jádra a takt by přišel o zahození rozpracované kopie,
když mu uprostřed chybí mapa nebo ves (`MissingData`) – bez kopie by se musel přepočítat znovu
od začátku volání a upozornění taktu by sdílela objekty se stavem, který další takty mění.
Od 10. 11. 2026 je kopie ruční a ≈ 5× levnější (`cloneData`) – viz níž „Kopie stavu za takt“.

**Načítání vsí z databáze** (7. 11. 2026). Měření v paměti výš to nezachytí: každé kolo (1× za
sekundu) načetlo celé stavy vsí, kterých se tažení týká – mapa políčka (`listBySettlement`), ves
pro takt (`find`) a vlastník vsi (`watcherOf` – `find`) –, tedy u velké vsi ≈ 3 × 3 MB na tažení
a kolo, i když paměť workeru měla tentýž stav. Teď se kolo ptá jen na otisky:

- `computeCampaign` → `loadVillages`: vsi, které paměť workeru zná, nejdřív levným dotazem
  `VillageRepository.stampsOfVillages(ids)` (id, sídlo, jméno, verze, `last_day` bez stavu);
  celý stav (`find`) jen u vsi, kterou paměť nemá nebo má jinou verzi či jméno. Každý zápis stavu
  verzi zvedá (uložení i post do schránky – i události tažení samotného), přejmenování mění
  jméno, takže výsledek je tentýž jako s `find` u každé vsi; bez paměti (web, testy) `find` jako
  dřív.
- `villageWatchers` (vlastník a průchod) a `deliver` (existuje ves?) jen přes `stampsOfVillages`,
  mapa políčka se sídlem (`createCampaignCells`) bere id vsí z `stampsOf([sídlo])`.

`apps/worker/scripts/measure-campaign-db.ts` – nad skutečnou databází `bohemia_measure` (nikdy
`bohemia` pro zápis; zdrojová ves = největší ves `bohemia`, jen čtení): 20 tažení × 60 mužů, každé
u vlastní kopie velké vsi (nájezd), tažení a body v paměti, vsi, sídla, rody a vazalství z DB,
s pamětí workeru. Za kolo (4 takty) skutečný čas a bajty přečtené ze spojení poolu. Ves `bohemia`
mezitím dopočítává worker – `--source <soubor>` drží zdroj pro srovnání před / po (otisk bodů musí
sedět).

```bash
nice npx tsx apps/worker/scripts/measure-campaign-db.ts --rounds 20 --source /tmp/zdroj.json
```

Změřeno 7. 11. 2026 (ves 3,11 MB, 20 tažení, 20 kol; „další kola“ = průměr kol 2–20; otisk bodů
před i po `e79f0cb0`):

| kolo       |             před |                 po |
| ---------- | ---------------: | -----------------: |
| 1. kolo    | 3 824 ms, 311 MB |    1 574 ms, 62 MB |
| další kola | 1 673 ms, 187 MB | **178 ms, 3,4 MB** |

Před tím kolo trvalo déle než perioda smyčky (1 s). Zbylá data po zrychlení jsou skutečné změny:
uložení bodu po 40 taktech doručí události nájezdu do schránek vsí (verze +1) a další kolo vsi
jednou načte celé.

### Varování a útěk do hradiště (plán 2026-11-09 – Úloha 15)

**Tažení s varováním** – `measure-campaigns.ts` jako výš, scénáře „varování 5“ (5 tažení na
varované vsi NPC – oči vsi, posel a útěk „se vším“ do hradiště o políčko dál) a „pochod 15 +
varování 5“ (20 tažení × 60 mužů, z toho 5 s varováním). Změřeno 10. 11. 2026 (M-série, jedno
jádro):

| scénář                 | tažení | jádro | cesta (A\*) | nejdražší sami                              |
| ---------------------- | -----: | ----: | ----------: | ------------------------------------------- |
| pochod                 |     20 | 4,5 % |        13 % | `structuredClone` 46 %, čtení bodu 38 %     |
| opevněné vsi (nájezd)  |      5 | 5,4 % |         1 % | `nearestForestOf` 23 %, `campaignTick` 21 % |
| varování               |      5 | 2,4 % |        12 % | `campaignTick` 48 %, čtení bodu 25 %        |
| pochod 15 + varování 5 |     20 | 5,6 % |        12 % | `structuredClone` 51 %, čtení bodu 33 %     |

**Cíl plánu ≤ 6 % jádra pro 20 tažení s varováním je splněn (5,6 %)** – mezipaměť očí po dnech ani
zkrácení dohledu (Rizika plánu) nejsou potřeba: oči vsi a doběh jsou v `TickContext` po dnech
(`lookouts`, `runs`) a dohled se počítá jen od skupin. Tažení na varované vsi stojí ≈ 1,5× pochod
(takty/s 828 proti 1 279). Pozn.: „opevněné 5“ stojí 5,4 % proti 2,5 % ze 7. 11. – čas je
v `nearestForestOf` (les na žebříky – `ladders.ts`, `npc-assault.ts`) a `distanceToSegment`, ne
ve varování; pod cílem 25 %.
**Oprava 10. 11. 2026 (`perf/war-forest`):** `nearestForestOf` hledá po kbelících 8 × 8 buněk místo
průchodu všemi středy lesa (výsledek bit po bitu týž, otisk „opevněné 5“ `669e1e4e` beze změny).
„Opevněné 5“ (strojová zátěž kolísala, load 50–110): jádro 6,6 % → 4,8 %, takty/s 301 → 418,
`nearestForestOf` 10 % → mimo první řádky profilu; zbytek je `campaignTick` 29 %, `distanceToSegment`
9 % (`Math.hypot` v `village/placement/polygon.ts`, bez změny výsledku nezrychlitelné).

**Kopie stavu za takt (10. 11. 2026, `perf/campaign-clone`).** Worker i měření volají
`stepCampaigns` každých 250 ms, takže `stepCampaign` počítá skoro vždy **jeden takt**: za takt ho
kolo volá 2× (první volání vrátí hned `waiting` – mapy si `computeCampaign` načítá v každém kole
znovu; bez taktu, bez kopie), s vesnicí na cestě 3× (druhé spadne na `MissingData` hned v prvním
taktu – ves; kopie se zahodí). Kopie „jednou za volání“ místo za takt by proto nepomohla.

- **Úprava:** `campaignTick` kopíruje stav ručně – `cloneData` z `domain/village/core/clone.ts` (obecná
  část `cloneState` vsi, bez sdílení) místo `structuredClone`: stav pochodu 60 mužů (≈ 28 kB JSON)
  ≈ 40 µs místo ≈ 210 µs. Výsledek je tentýž – jen sdílené odkazy uvnitř stavu rozdělí jako JSON
  kontrolního bodu; v testech a měření stav sdílí jen záznamy, které se nemění na místě (prázdná
  `route` bojovníků z `openBattle` – `...base`, `seenAt` varovaných vsí, `PersonRef` zajatce
  v `captives` i `loot.prisoners`). Všechny testy `packages/game` (zlaté otisky tažení, války,
  opevnění a útěku) i otisky měření beze změny; nové testy (`campaign.test.ts`, `clone.test.ts`):
  zmražený vstup `stepCampaign` (stejný výsledek, žádný sdílený objekt), `MissingData` uprostřed
  vícetaktového kroku (výsledek = stav posledního celého taktu) a `cloneData` = `structuredClone`.
- **Proč ne předání vlastnictví** (use-case smí stav měnit na místě, při `MissingData` se vrátí
  k JSON bodu a takty přehraje; návrh Clauda – zamítnuto): `MissingData` v prvním taktu volání
  přichází u nájezdu a varování v každém kole, takže by se pokaždé četl bod znovu (≈ 95 µs, víc
  než ruční kopie) a přehrávalo od něj – s jinými načtenými vsemi než při prvním výpočtu. Stav by
  navíc sdílel objekty s událostmi a upozorněními taktu, se záměry i se světem (vsi v paměti
  workeru) a každé vložení do stavu by se muselo hlídat. Ušetřilo by se už jen ≈ 40 µs za takt.

Měřeno střídavě před / po (2 dvojice, load 30–40 – souběžně e2e a jiný agent; M-série, jedno
jádro). Otisky beze změny:

| scénář                 | tažení | jádro před |      jádro po | takty/s před |  takty/s po | otisk      |
| ---------------------- | -----: | ---------: | ------------: | -----------: | ----------: | ---------- |
| pochod                 |      1 |  0,4–0,5 % |     0,3–0,4 % |      808–969 | 1 097–1 238 | `9c402aa9` |
| pochod                 |      5 |  1,7–1,9 % |     1,3–1,4 % |  1 053–1 195 | 1 464–1 525 | `57f37aaf` |
| pochod                 |     20 |  5,1–5,3 % | **3,3–3,4 %** |  1 508–1 556 | 2 344–2 455 | `7dea2bb5` |
| opevněné vsi (nájezd)  |      5 |  5,2–5,5 % |     4,5–5,2 % |      364–383 |     384–443 | `669e1e4e` |
| varování               |      5 |      2,9 % |     1,8–1,9 % |      687–700 | 1 045–1 143 | `3826f1c5` |
| pochod 15 + varování 5 |     20 |      6,7 % | **4,0–4,4 %** |  1 189–1 198 | 1 827–2 013 | `d3a14f56` |

Profil po (pochod 20): `(anonymní)` 57–60 % – čtení bodu (`JSON.parse` v portu, ≈ 95 µs) a otisk
bodu (`JSON.stringify(from)` v `stepOne`, ≈ 120 µs – v každém kole bez uložení), hledání cesty
(`search`) 16–18 %, `cloneObject` 13–14 %; u nájezdu `cloneObject` 18 % (dřív `campaignTick` 29 %
– do něj profil připisoval `structuredClone`). **Další kandidát:** otisk bodu bez
`JSON.stringify` (verze bodu z úložiště – změna portu a adaptéru DB), pak čtení bodu jen při
změně verze – hotovo, viz níž „Paměť kontrolního bodu“.

**Paměť kontrolního bodu a mapy předem (10. 11. 2026, `perf/campaign-checkpoint`).** Kolo četlo
kontrolní bod z JSON (≈ 95 µs, v DB navíc přenos celého `state` jsonb) a pro paměť workeru počítalo
jeho otisk `JSON.stringify` (≈ 120 µs) – v každém kole, i když se bod 40 taktů neměnil.

- **Verze bodu z úložiště:** `CampaignCheckpoint.version` a `CampaignRepository.checkpointVersion`
  (jen verze, bez stavu). V DB je verze `xmin` řádku `campaign_checkpoint` – mění ho každý UPDATE
  (uložení bodu, `clearOutbox`), zámky řádku (`FOR UPDATE` při uložení, `FOR SHARE` u záměru) ani
  záměry ne; **bez sloupce a migrace** a bez spoléhání na to, že každý zápis verzi zvedne (takt
  bodu by stačil jen, kdyby se týž takt nikdy neuložil s jiným stavem – port to nevylučuje;
  `updated_at` nemění `clearOutbox`). Táž hodnota by se vrátila až po obrátce čísel transakcí
  (2³²) – paměť drží bod jen běžícího tažení. Porty v paměti: testy verzi = obsah řádku (i přímá
  úprava řádku v testu), měření číslo zápisu.
- **Paměť bodu** (`CampaignMemory.points`, `readCheckpoint`): známý bod → jen dotaz na verzi; stav
  z JSON se čte, jen když se verze liší (uložení, doručení událostí, jiný proces). Uložení bodu
  a doručení starého `outbox` bod z paměti zahodí (další kolo ho přečte rovnou celý), skončená
  tažení se zapomenou na konci kola. `CampaignMemo.checkpoint` = verze bodu místo jeho JSON. Bod
  se nemění na místě – `stepCampaign` vstup nemění (takty kopírují), test se zmraženými body
  (`Object.freeze` do hloubky) dá tytéž body jako bez paměti.
- **Mapy a vsi předem** (`CampaignMemory.needs`): `computeCampaign` zapíše políčka map a vsi, na
  které se takty kola ptaly (i ves, která neexistuje), a další kolo je načte **před prvním krokem**
  stejnou cestou jako na vyžádání – mapu znovu z `CampaignCells.mapOf` (může se změnit: nové sídlo
  na políčku, nová ves), ves podle otisku (`loadVillages` – celý stav jen při jiné verzi či jménu),
  vlastníka a vztahy (`watchers`) znovu. Bariéra beze změny – `villageAt` dá ves jen s `lastDay ≥ d − 1`,
  jinak takt čeká a ves se načte znovu. Mapa nebo ves, na kterou se takty přestaly ptát, vypadne. Dřív první `stepCampaign` kola vracel hned `waiting` (mapy) a u vsi na cestě druhý
  zkopíroval stav a spadl na `MissingData` (ves) – kopie zahozena. Dotazy varování (`alarmOf`,
  `refugeHostsOf`, `domainOf`) se předem **nenačítají** – takt je potřebuje jen při vstupu vsi do
  varování, předem by šly do úložiště dotazy navíc (`alarm-world.test.ts` – na každou odpověď jen
  jednou).
- **Vlastníci vsí** (`CampaignMemory.owners`): na vlastníka se takt ptá u každé nevarované vsi na
  mapě vojska – načtený vlastník platí `OWNER_KEEP_TICKS` (86 taktů ≈ 22 s) i v dalších kolech,
  starší zapomene konec kola (docs/code/war.md – Hráč ve vsi a mimo ni: Opravy po závěrečné recenzi).

Výsledek je tentýž: všechny testy `packages/game` (zlaté otisky tažení, války, opevnění a útěku),
otisky měření, `test:db` (nový test verze bodu) i e2e `multiplayer-war.spec.ts` beze změny.
Měřeno střídavě před / po (2 dvojice, load 2–7; M-série, jedno jádro):

| scénář                 | tažení | jádro před |      jádro po | takty/s před |  takty/s po | otisk      |
| ---------------------- | -----: | ---------: | ------------: | -----------: | ----------: | ---------- |
| pochod                 |      1 |      0,3 % |         0,2 % |  1 330–1 368 | 1 814–1 875 | `9c402aa9` |
| pochod                 |      5 |  1,1–1,2 % |     0,7–0,8 % |  1 696–1 744 | 2 626–2 783 | `57f37aaf` |
| pochod                 |     20 |  2,9–3,0 % | **1,3–1,4 %** |  2 711–2 786 | 5 898–5 933 | `7dea2bb5` |
| opevněné vsi (nájezd)  |      5 |  3,9–4,0 % |         3,1 % |      502–515 |     642–653 | `669e1e4e` |
| varování               |      5 |      1,9 % |         1,3 % |  1 048–1 079 | 1 512–1 523 | `3826f1c5` |
| pochod 15 + varování 5 |     20 |  3,9–4,0 % |     **2,2 %** |  2 017–2 073 | 3 596–3 656 | `d3a14f56` |

U pochodu je zisk skoro celý z paměti bodu, u nájezdu a varování přidají mapy a vsi předem (jen
paměť bodu, jedno měření při load ≈ 20: opevněné 593, varování 1 357 taktů/s; s mapami předem
641 a 1 525 – `cloneObject` u nájezdu 24 % → 14 %). Profil po: pochod 20 – hledání cesty
(`search`) 38 %, `cloneObject` 32 %, `(anonymní)` 9–10 % (dřív 61 %); nájezd – `(anonymní)`
18–19 % (bod se ukládá a čte často – události), `distanceToSegment` 15 %, `cloneObject` 14 %.

**Pohled na varování** – panel dvorce se při varování ptá na událost `alarm` (`use-alarm.ts` – ≈ s
každým uložením bodu tažení, o kterém ves ví, tedy ≈ každých 10 s; server-events.md – Válka) a server
pokaždé spočte `villageAlarmView`: přístup k vsi, Vrátit se, tažení s varováním (kontrolní bod),
kandidáti hradišť, mapy políček a volby (`alarmChoices`). `apps/worker/scripts/measure-alarm-view.ts`
– nad skutečnou databází `bohemia_measure_alarm` (vytvoří a zmigruje; zdroj = největší ves `bohemia`,
jen čtení): ves hráče a jeho hradiště jako kopie zdroje, tažení 60 mužů s varováním vsi; čas dotazu
a jeho části (repozitáře obalené měřičem), „před“ = paměť vsí jen na jeden dotaz (`withVillageCache`),
„po“ = jako `apps/web/lib/alarm.ts`. Databázi po měření zruš (`DROP DATABASE bohemia_measure_alarm`).

```bash
nice npx tsx apps/worker/scripts/measure-alarm-view.ts --rounds 20
```

Změřeno 9. 11. 2026 (Vlkov 3,14 MB, 20 dotazů po prvním):

| varianta                                   | dotaz (průměr) | úložiště | výpočet | načtení stavu vsi          |
| ------------------------------------------ | -------------: | -------: | ------: | -------------------------- |
| před – paměť na dotaz (`withVillageCache`) |        76,1 ms |  59,9 ms | 16,2 ms | 2× `find` (ves + hradiště) |
| po – paměť přes dotazy + mřížky            |     **4,2 ms** |   3,7 ms |  0,5 ms | 3× `stampsOf` (otisk)      |

Dřív stál dotaz ≈ 76 ms (3 % jádra na jednoho hráče s otevřeným panelem při varování): dvakrát
3 MB JSON (ves a hradiště) a mřížka pochodu mapy vsi v každém dotazu. Teď:

- **Paměť vsí přes dotazy** (`VillageMemory` v `packages/server/village-cache.ts`, `withVillageMemory`):
  `alarmViewForPlayer` běží v rozsahu paměti, která přežije dotaz – `cachedVillages` vrátí týž
  záznam, dokud levný otisk (`stampsOf` – verze a jméno) sedí, jinak načte znovu. Nejvýš 8 vsí
  (naposledy použité), stav vsi je neměnný – výsledek je tentýž jako s načtením.
- **Mřížky pochodu** (`AlarmViewDeps.grids` – `MarchGridMemo` jako ve workeru): klíč je identita
  krajiny, překážek a stavu vsi a den – s pamětí vsí týž objekt, takže se mřížka staví jednou za den
  nebo změnu vsi.

### Hustý les v mřížce pochodu (plán 2026-11-16-dense-forest – Úloha 8)

`measure-campaigns.ts` (výchozí argumenty, takty/s – vyšší je lepší; RSS z `/usr/bin/time -l`,
kolísá o ≈ ±50 MB mezi běhy). Báze = `chore/next-upgrade` (feat/landscape + Next.js 16.4.6),
„před“ = větev 16. 11. 2026 (Úloha 8), „po“ = větev s opravou NPC velitele a pamětí posunutého
cíle (17. 11. 2026, báze i „po“ měřené po sobě na klidném stroji):

| Měření                 | báze               | větev před          | větev po            |
| ---------------------- | ------------------ | ------------------- | ------------------- |
| pochod 1 / 5 / 20      | 1870 / 2694 / 5565 | 1246 / 2046 / 17865 | 1112 / 1959 / 17662 |
| opevněné 5             | 606                | 608                 | 637                 |
| varování 5             | 1523 (1,3 % jádra) | 75 (26,8 % jádra)   | 1013 (2,0 % jádra)  |
| pochod 15 + varování 5 | 3460               | 299                 | 4113                |
| RSS                    | 720 MB             | 779–890 MB          | 783 MB              |

- Varování 5 – příčina nebyla čekání na ves (měření vsi drží spočtené napřed; kola jsou
  `computed`, žádné `waiting`): cíl tažení (0, 0) leží uprostřed hustého lesa, `settleGoal` ho
  posune na dosažitelné místo a NPC velitel (`marchIntents`) to bral jako „jinam“ – každý takt
  skupinu poslal znovu (`sendGroup` zahodí úsek), takže se každý takt znovu hledal posun cíle
  i úsek hustým lesem. Oprava: místo rozkazu v `orderedPos`; posun si `reachableGoal` pamatuje
  při mřížce (`settledGoals`) – první takt tažení se při dočítání dat počítá až 4× a skupiny na
  témž místě se ptají stejně. Zbylý rozdíl proti bázi je první úsek hustým lesem (≈ 2,7 ms).
- Pochod 1 zůstává ≈ 1,7× pomalejší (jemná mřížka 768 × 768), ostatní scénáře v mezi.
- Paměť: +63 MB proti bázi (mez návrhu Clauda 150 MB); `MEMO_DAYS` zůstává 4. Mřížka mapy bez
  vsi má v paměti den 0 (na dni nezávisí – závěrečná revize A – M3), staví se jednou, ne každý den.
- **Cena uvízlé entity** (závěrečná revize A – I1, odhad z měření výš, neměřeno zvlášť): skupina
  na návratu nebo výprava, která domů nedojde ani „kudy přišla“, stojí a tažení či výprava
  neskončí – tažení končí jen po `allArrived`, velitel nedezertuje, výprava nemá jídlo ani dezerci
  a žije do nového rozkazu hráče. Worker ji dál počítá takt po taktu: 344 taktů dne × ≈ 0,3–0,9 ms
  (`cloneData` celého stavu), jednou denně pokus o cestu (≈ 5 ms, s novou mřížkou ≈ 70 ms),
  u výpravy mřížka dne pro šelmy a domovská ves zůstane vzhůru (`homeDay` – stav vsi na každý
  den). Celkem ≈ 0,15–0,4 s na herní den: ve skutečném čase ≈ 0,2–0,5 % jádra na entitu, při
  dopočtu po nepřítomnosti ≈ 40–110 s na herní rok; před větví 0 (uvíznutí přeneslo domů).
  **Proč se počítá:** „Vrátit se, kudy přišla“ (Martin 17. 11. 2026) – skupina zkouší cestu domů
  každý herní den a dojde, jakmile ji otevře stezka; den pokusu i ostatní dění taktu (čekání,
  dotazy varování, boj) musí přijít v pořadí taktů. Rychlá cesta – takty dne uvíznutí přeskočit
  bez kopie stavu, mají-li všechny pohyblivé skupiny `stuckDay` dne a takt žádné záměry – je
  odložená (plán 2026-11-16-dense-forest – Mimo plán); do té doby sledovat počet uvízlých entit,
  roste s hráči, kteří výpravu nechají stát.
