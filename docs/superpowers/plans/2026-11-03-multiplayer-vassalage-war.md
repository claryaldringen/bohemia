# Víc hráčů v jednom světě, seniorát, vazalství, opevnění a válka – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Shrnutí

- **Šest fází, 55 úloh po ≈ 100–150 krocích agenta (≈ 7 360 kroků).** Každá úloha je jeden běh
  agenta s vlastní větví, testy a commitem.
- **F1 Svět pro víc hráčů (10 úloh):** společná mřížka map, rod jako záznam `house`, umístění
  nováčka, veřejný rodokmen, upozornění mezi hráči, schránka vnějších událostí vsi, pozvánky –
  pozvaný začíná jako vazal holou přísahou. Hratelné: dva hráči v jednom světě se vidí.
- **F2 Seniorát a role ve vsi (6):** hráčův muž, senior a jeho práva, los po smrti (nástupce ½),
  nástupnictví za pozvaného, odchod po pohřbu, dosazení vojvody. **Posunuto před jednání** (dřív
  4.) – nepotřebuje druhého hráče a správa cizí vsi ve F4 stojí na jeho `villageRights`.
- **F3 Jednání (4):** nabídka, žádost, protinávrh, přijetí, odmítnutí, stažení, pauza, blokování.
- **F4 Vazalství (10):** dávky s výhledem a dopravou, Odvody 1. 11., zásilky, lidé a robota,
  pomoc a půjčky, obchod mezi hráči, správa cizí vsi a víc vsí, povýšení, odúmrť, vypovězení.
- **F5 Opevnění (8):** polský plot, palisáda, val s příkopem a nástavba na valu; obvod kreslený po
  čtvercích jako pole, brány v síti cest, stavba po úsecích s robotou vazalů, stáří a přestavba,
  násobky, útočiště a prolomení pro válku, správce podle hrozby. **Nepotřebuje druhého hráče** –
  může běžet souběžně s F1–F4 (nejlépe vedle F2–F3); musí být hotová před Ú6.4, 6.8 a 6.9.
- **F6 Válka (17):** po Ú6.12 hratelná válka podle rozkazu s obranou bez obránce, opevněním
  a mírem; Ú6.13–6.17 svolání a průchod, živé vedení, scéna, rozsudek, měření.
- **Klíčová rozhodnutí (návrh Clauda):** držitel vsi = `settlement.owner_id`; mezi hráči nic
  nesahá do cizí vsi přímo – jen **schránka vsi**, jejíž zápis zvedne verzi vsi; tažení je
  **deterministická funkce taktů a záměrů** s **bariérou** vůči dopočtu vsí.
- **Hlavní rizika:** souběh web × worker × tažení, výkon workeru (4 takty/s), únik cizích dat
  (mlha války, veřejný rodokmen), rozsah F6.

**Cíl:** Všichni hráči hrají v jednom světě: vidí se, jednají spolu, uzavírají vazalství s dávkami
a službou, rod žije přes seniorát a nástupnictví a spory se řeší válkou a mírem.

**Architektura:** Hexagon beze změny – nové domény `packages/game/src/domain/world`,
`domain/negotiation`, `domain/vassalage`, `domain/village/fortification`, `domain/war`; use-casy
v `application/` s porty, adaptéry v `packages/db/src/adapters/`, vstupní body web a worker. Vše, co se týká dvou hráčů, žije
v samostatných tabulkách (rody, jednání, dohody, dialogy, zásilky, války, tažení); do stavu vsi
se to dostane jen vnější událostí ze schránky v pevný herní den.

**Stack:** TypeScript 6, Vitest (in-memory porty, adaptéry proti `bohemia_test`), Drizzle +
PostgreSQL 17, Next.js 16 (server actions, Route Handler pro tažení), Babylon 9, Playwright.

**Spec:** `docs/design/fortifications.md` (schválen Martinem 3. 11. 2026 – „ano“; válka z něj bere
násobky, útočiště a prolomení), `docs/design/vassalage.md`, `docs/design/seniorate.md`,
`docs/design/war.md` (schváleny
Martinem 3. 11. 2026 jako celek). **Při rozporu platí oddíl „Odpovědi Martina“ dokumentu** – u
války tři odpovědi z 3. 11. 2026 tělo ještě nepřepsalo (vesničan s pevnou silou, únava z mrazu,
bod zlomu podle počtu) – sjednotí je Ú6.1. U vazalství odpovědi rozhodly otevřené otázky:
odúmrť s víc pány „ať spravují odúmrť všichni“, rodokmen veřejný všem (muži rodu a věk),
přepínač správce zůstává.

## Globální omezení

- **Hexagon a determinismus** (`CLAUDE.md`): doména bez I/O, žádné `Date.now()`, `new Date()` bez
  argumentu ani `Math.random()` v `packages/game`; skutečný čas a náhoda parametrem nebo portem.
- **Čísla pravidel jen v `rules*.ts`** s odkazem na sekci návrhu: nové `domain/world/rules-world.ts`
  (`WORLD`, `INVITES`), `domain/negotiation/rules-negotiation.ts` (`NEGOTIATION`),
  `domain/vassalage/rules-vassalage.ts` (`VASSALAGE`), `domain/war/rules-war.ts` (`WAR`),
  `domain/village/rules-fortifications.ts` (`FORTIFICATIONS` – válka násobky opevnění jen čte);
  změna čísla = i text v návrhu.
- **Nové části stavu vsi jsou volitelné** a starší vsi se převedou jednou a idempotentně
  (`updateVillage` / začátek `advanceVillageSteps`).
- **Výsledek vsi nezávisí na kouscích dopočtu** – každá úloha, která mění stav vsi nebo schránku,
  má test „po kouscích“ (1, 3, 10 dní + zbytek = vcelku, stejný JSON).
- **Jeden zámek na operaci, nikdy vnořený, nikdy uvnitř transakce** (worker plán). Zámek vsi =
  zámek **držitele** (`settlement.owner_id`). Worker zámky jen zkouší (`tryRun`).
- **Server je jediná autorita a nic cizího neprozradí:** každý pohled se skládá na serveru pro
  přihlášeného hráče; cizí rod vidí jen jméno, muže rodu od 16 let s věkem, polohu map a to, co
  je v dohledu jeho mužů. `weather_seed` ani stav cizí vsi nikdy do prohlížeče.
- **Rozhraní jako 0 A.D.:** ikony s čísly, slova jen v `Tooltip`, důvod u kurzoru. Výjimky podle
  návrhů: vzkaz (vstup hráče), kód pozvánky, textový panel Vojsko, formulář registrace.
- **Babylon** z konkrétních modulů, jen ve scéně; kreslí se jen při změně; WebGPU limit 8 vertex
  bufferů; grafika jen CC0 nebo 0 A.D. se zdrojem v `LICENSES.md`.
- **Deterministická matematika** (`det-math.ts`, ESLint) i v `domain/war/**` – tažení musí vyjít
  stejně ve webu i workeru – a v `domain/village/fortification/**` (obvod opevnění počítá server
  i prohlížeč).
- **Migrace:** `npm run db:generate` po změně schématu, ruční SQL jen pro převod dat; subagent pouští
  migrace jen do `bohemia_test` (`test:db`), do `bohemia` je pustí hlavní session po sloučení
  (paměť – „Migraci pouštím já“).
- **Dokumentace:** mapa kódu v nových `docs/code/world.md`, `docs/code/vassalage.md`,
  `docs/code/village-fortifications.md`, `docs/code/war.md` (+ řádky v tabulce `CLAUDE.md`),
  pravidla v `docs/design/`. Rozhodnutí „návrh Clauda“, Martin citovaný s datem.
- **Ověření po každé úloze:** `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run format:check`; u adaptérů `npm run test:db`; u webu, přihlašování a scény
  `npm run test:e2e`. Commit Conventional Commits česky, poslední řádek
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Kalibraci (`measure-village`)
  nepouštět.

## Na co dát pozor při review

1. **Událost do vsi, která už ten den spočítala** (posun času hráče ve vývoji, worker uprostřed
   dávky) – použije se v nejbližším nespočítaném dni, nikdy se neztratí ani nezdvojí. Test v Ú1.6
   a Ú1.7.
2. **Dvojí odpověď na totéž jednání** (dvě karty prohlížeče, přijetí souběžně se stažením) –
   projde právě jedna akce, dohoda vznikne nejvýš jednou. Test v Ú3.2.
3. **Rod vymře s rozběhnutými věcmi** (jednání, zásilka na cestě, čekající dialog, správa cizí
   vsi) – jednání skončí, zásilka dojde, dialogy zmizí, správa skončí. Test v Ú4.10.
4. **Podvržený záměr** (pohyb cizího muže, útok na neviděný cíl, akce ve vsi po odvolání ze
   správy) – server odmítne a v odpovědi nic neprozradí. Testy v Ú4.8 a Ú6.14.
5. **Restart workeru nebo webu uprostřed tažení** – tažení pokračuje z kontrolního bodu se stejným
   výsledkem, události do vsí se nezdvojí. Test v Ú6.5.
6. **Opevnění a síť cest** – ves bez opevnění má síť pěšin i vozovou síť bit po bitu stejnou (zlatý
   otisk, nový `WALK_VERSION`); obvod opevnění vyjde stejně ve webu i na serveru (det-math).
   Testy v Ú5.1 a Ú5.3.

---

## Výchozí stav kódu (3. 11. 2026, `feat/landscape` 46413ced)

- **Hráč = účet** (`user`, Better Auth). Rod jako záznam neexistuje – „rod hráče“ jsou všechny
  aktivní sídla hráče (`settlement.owner_id`), konec hry = vymření všech vsí (`dynastyStatus`,
  `restartGame` sídla archivuje).
- **Jedna ves, jedna mapa** (Martin 1. 11. 2026): `settlement` = mapa se seedem krajiny,
  `village_settlement_uq`. Mřížka map je **každého hráče zvlášť** – `settlement.grid_x/grid_y`,
  unikátní index `settlement_owner_grid_idx` (vlastník, x, y), sídelní sídlo (0, 0) až s prvním
  odchodem (`assignWorldCell`), sousední mapa `neighbourCell` (`domain/village/world-grid.ts`,
  8 směrů), vlastní vsi kolem `ownMapsOfPlayer` / `ownMapsAround`. Seed nové mapy z `SeedSource`
  (náhodný).
- **Sousedé pro obchod** jsou fikce okolí vsi (`neighbourOf(seed, směr)`, `neighbours.ts`) –
  výprava `TradeExpedition` v `state.trade.expeditions` s vlastním podílem práce
  (`expeditionLaborToday`) a karavanou ve scéně; výměna lidí `people-trade.ts`
  (`emigrantGroups`, `settleNewcomers`).
- **Id lidí jsou místní** (`state.nextId`); odchod do nové vsi id přenáší (`foundVillage` ze
  `Settlers`). Muž rodu = `Person.line && sex male` (`isLineMan`), dovednosti `Person.arms`
  (`trainArms` jen v `trainLordDay`; strop podle věku `armsCap`, `LORD.cap`); lov rodu
  (`hunt.ts`) dnes necvičí.
- **Správce** (`StewardState`, `stewardDay`), odchozí schránka synů (`steward.departures`,
  `settleStewardDepartures`), ochrana nové vsi před pohromou `protectionYears: 5`
  (`rules-disasters.ts`).
- **Worker** (`apps/worker`, `advanceWorldStep`): zámek hráče `PlayerLock` (Postgres advisory),
  fronta `WorldQueue`, optimistická verze vsi (`VillageRepository.save(…, expectedVersion)`),
  souhrn vsi `village.digest` (`VillageDigest`, `VILLAGE_DIGEST_VERSION` = 1, platí jen při
  `digest_version = version`).
- **Ploty a stavby po čtvercích** (pro opevnění): pletený plot pozemků, ohrad a hřbitova
  (`woven-fence.ts`, `WovenFenceRenderer`, rohy `WOVEN_FENCE_CORNER_M`), obrys plotu ve světě
  `fenceOutline` / `outlineRuns` (`paths/entrances.ts`), ploty v síti cest (`paths/fences.ts`,
  `fenceBand`, branky `entranceCells`), plot podle délky (`fence-cost.ts`), malování po čtvercích
  (`field-painting.ts`, natočená mřížka `square-grid.ts`), rozcestník druhů v katalogu
  (`build-items.ts` – `variants` ohrad). Opevnění zatím žádné.
- **Web:** server actions `apps/web/app/game/actions.ts`, dotazování `lib/village-polling.ts`,
  upozornění **odvozená z rozdílu pohledů** (`lib/village-notices.ts`, `NoticeLines.tsx`) – nic
  trvalého, horní lišta `TopBar.tsx`, přepínač `VillageSwitcher.tsx`, panely v
  `components/game/hud/`. Posun času hráče (dev) `player_time_offset` – dnešek hráče = den světa
  - posun.
- **Migrace** `0000`–`0012`; tabulky `user`/auth, `settlement`, `village`, `village_year`,
  `player_time_offset`.

## Technická rozhodnutí (návrh Clauda)

1. **Držitel vsi zůstává `settlement.owner_id` (hráč)** – NPC rody vsi nedrží (vassalage.md –
   Povýšení: „je správcem, ne držitelem“), takže držitelem je vždy hráč. Odúmrť, věnování
   a postoupení vsi = změna `owner_id`. Zámek vsi = zámek držitele. Proč: všechny dnešní
   use-casy, fronta workeru i zámek stojí na vlastníkovi sídla – změna vlastníka je jeden `UPDATE`.
2. **Rod = řádek `house`** (hráčův, nebo NPC); hráč má nejvýš jeden živý rod. Dohody, jednání
   z pohledu rodu, nástupnictví a veřejný rodokmen se váží k rodu. Začít znovu = nový rod, staré
   dohody skončily vymřením (vassalage.md – Začít znovu) bez zvláštního kódu.
3. **Společná mřížka světa:** jeden unikátní index (x, y) přes aktivní sídla všech hráčů; každé
   sídelní sídlo dostane políčko při založení. **Seed krajiny nové mapy =
   `cellLandscapeSeed(world.seed, cell)`** (`WORLD_SEED` z prostředí) – prázdné políčko, přes které
   jde vojsko, má tutéž krajinu jako budoucí ves syna na něm. `weather_seed` zůstává náhodný
   a tajný. Vývojová sídla migrace rozestaví po 16 sloupcích na hráče (do ostrého světa se
   nepřenášejí – premium-landscapes.md).
4. **Schránka vsi (`village_inbox`) – jediná cesta, jak cizí věc změní ves:** událost má herní den
   a tělo (diskriminovaná unie `VillageEventBody`); `advanceVillageSteps` ji použije na začátku
   svého dne. **Zápis do schránky v téže transakci zvedne `village.version`** (i
   `digest_version`) – rozběhnutý dopočet té vsi narazí na konflikt verze a zopakuje se
   i s událostí (dnešní pojistka verzí). Den události = `max(den, last_day + 1)`; v ostrém světě
   (bez posunu času) to je vždy den z pravidla, protože cesta trvá aspoň den. Proč ne zámek
   cílového hráče: dva zámky v jedné operaci by porušily pravidlo „nikdy vnořený“.
5. **Mezihráčské záznamy (jednání, dohody, dialogy, zásilky, války) v transakcích nad vlastními
   tabulkami bez zámku hráče**; účinek na ves odesílatele jde pod zámkem jejího držitele (jeden
   zámek), účinek na ves příjemce schránkou. Správce cizí vsi jedná pod zámkem držitele té vsi.
6. **Upozornění mezi hráči jsou trvalá** (`player_notice`), vesnická zůstávají odvozená z pohledu;
   web je slije do `NoticeLines`. Volné zprávy nejsou (ne-cíl) – vzkaz patří k jednání nebo
   dialogu.
7. **Veřejný rodokmen ze souhrnu vsi** (`VillageDigest.lineMen`) – adresář rodů nečte stavy vsí;
   seznam podle vzdálenosti, nejvýš 50 nejbližších rodů na dotaz.
8. **Jednání = jedna tabulka pro všechny druhy**, body jako unie `TermItem` ověřená na serveru
   (`parseTermItems`), účinky přijetí přes registr `NegotiationEffects` v téže transakci;
   „jedno jednání mezi dvěma hráči“ hlídá unikátní částečný index nad seřazenou dvojicí.
9. **Dialogy** (Odvody, Svolání, odeslání obchodu a poplatku, odúmrť, rozsudek) = tabulka
   `dialog` s jedinečným klíčem; vytváří je worker k hernímu datu (po výpadku doběhne), čekající
   dialog se jen navýší o rok.
10. **Zásilka** = výprava ve vsi odesílatele (`TradeExpedition` s `kind: 'shipment'` – práce
    nosičů a karavana zdarma) + událost `shipment` do schránky cílové vsi v den
    `odeslání + 2 × vzdálenost` (vzdálenost = kroky mřížkou v 8 směrech). Řádek `shipment` drží
    seznam „na cestě“ a odolnost proti pádu mezi uložením vsi a zápisem do schránky.
11. **Lidé mezi vsemi různých držitelů** dostanou v cílové vsi nová místní id; odkaz napříč vsemi
    je `PersonRef { villageId, personId }`. Kdo je pryč jen na čas (robota, služba, tažení,
    zajetí, ochrana), zůstává ve stavu domovské vsi s `Person.away` (doma nepracuje ani nejí)
    a hostitelská ves ho vede jako hosta (`VillageState.guests`).
12. **Tažení = čistá funkce** výchozího stavu, seedu a záznamu záměrů s číslem taktu
    (`stepCampaign`), **4 takty za sekundu**. Záměr hráče se plánuje na takt `teď + 2` (≈ 0,5 s),
    takže výsledek nezávisí na tom, kdo a po jakých kouscích počítá. Worker počítá tažení
    **vlastní smyčkou** (perioda 1 s) a ukládá kontrolní bod každých 40 taktů; web při pohledu
    dopočte z kontrolního bodu. Klient nesimuluje – dostává snímky dotazováním 2× za sekundu
    a interpoluje; mlhu války filtruje server.
13. **Bariéra ves × tažení:** ves, na jejíž mapě (nebo políčko od ní) je cizí tažení, se smí
    dopočítat jen do dne, do kterého je tažení spočítané; tažení do mapy vstoupí se stavem vsi ke
    konci předchozího dne a do té doby se dál nepočítá (worker má takové vsi přednostně). Výsledky
    boje jdou do schránky na následující den. Obě strany se střídají – cyklus čekání nevznikne.
14. **Přítomnost hráče u tažení** = záměr `presence` z klienta (≤ 2 s); bez něj déle než 1 herní
    den (344 taktů) převezme zástupce, nebo se výprava rozpadne – deterministicky ze záznamu.
15. **Posun času hráče (dev) ve sdíleném světě:** zůstává; mezihráčské události se zarovnají na
    `last_day + 1` (rozhodnutí 4). Multiplayer e2e posun nepoužívají.

### Společné typy (jména závazná pro všechny úlohy)

- `domain/world`: `GridCell` (z `world-grid.ts`), `cellDistance(a, b): number` (Chebyshev),
  `OccupiedCell { cell: GridCell; ownerId: string }`.
- `application/houses.ts`: `House { id: string; playerId: string | null; kind: 'player' | 'npc';
createdAt: Date; endedAt: Date | null; endedDay: number | null; lord: PersonRef | null }`,
  `PersonRef { villageId: string; personId: number }`.
- `domain/village/inbox.ts`: `VillageEvent { id: string; villageId: string; day: number; seq:
number; body: VillageEventBody }`, `NewVillageEvent = Omit<VillageEvent, 'id' | 'seq'> & { ref:
string }` (`ref` jedinečný – idempotence zápisu).
- `application/notices.ts`: `PlayerNotice { id: number; playerId: string; kind: PlayerNoticeKind;
payload: Record<string, unknown>; gameDay: number; createdAt: Date; readAt: Date | null }`.
- `domain/negotiation/types.ts`: `TermItem` (unie podle `kind`), `NegotiationRound { by: string;
items: TermItem[]; message: string | null; at: Date }`, `Negotiation { id: string; parties:
[string, string]; initiator: string; turn: string; status: 'open' | 'accepted' | 'rejected' |
'withdrawn' | 'blocked' | 'ended'; rounds: NegotiationRound[]; version: number }`.
- `domain/vassalage/macro.ts`: `MacroGood = 'grain' | 'hay' | 'logs' | CattleGood | HorseGood`,
  `MacroGoods = Partial<Record<MacroGood, number>>`, `MacroBundle { goods: MacroGoods; people?:
TradePeople; laborDays?: number }`.
- `application/vassalages.ts`: `Vassalage { id: string; lordHouseId: string; vassalHouseId: string;
terms: VassalTerms; origin: 'invite' | 'negotiation' | 'escheat' | 'ennoble' | 'peace'; sinceAt:
Date; sinceDay: number; endedAt: Date | null; breaches: number; version: number }` (`breaches`
  přidá Ú4.2).

## Přehled úloh

| Úloha | Co                                                     | Kroky | Závisí na           |
| ----- | ------------------------------------------------------ | ----- | ------------------- |
| 1.1   | Mřížka světa a umístění nováčka (doména)               | ≈ 100 | –                   |
| 1.2   | Společná mřížka v DB a use-casech, seed mapy z políčka | ≈ 140 | 1.1                 |
| 1.3   | Rod jako záznam `house`                                | ≈ 110 | –                   |
| 1.4   | Veřejný rodokmen a adresář rodů                        | ≈ 120 | 1.2, 1.3            |
| 1.5   | Upozornění mezi hráči                                  | ≈ 110 | –                   |
| 1.6   | Schránka vsi – doména a use-casy                       | ≈ 130 | –                   |
| 1.7   | Schránka vsi – adaptér, worker, souběh                 | ≈ 120 | 1.6                 |
| 1.8   | Pozvánkové kódy a registrace                           | ≈ 130 | 1.3                 |
| 1.9   | Pozvaný jako vazal u pána, aktivní dny, nástupnictví   | ≈ 140 | 1.2, 1.3, 1.5, 1.8  |
| 1.10  | Panel „Rod a vazalové“ – první verze, e2e dvou hráčů   | ≈ 140 | 1.4, 1.5, 1.9       |
| 2.1   | Hráčův muž a vlastní ves                               | ≈ 120 | 1.3                 |
| 2.2   | Senior a práva ve vsi                                  | ≈ 140 | 2.1, 1.7            |
| 2.3   | Rozhraní seniorátu                                     | ≈ 110 | 2.2, 1.10           |
| 2.4   | Nástupnictví hráče – los a nástupnictví bez losu       | ≈ 140 | 2.1, 1.9            |
| 2.5   | Odchod mladšího syna po pohřbu                         | ≈ 120 | 2.4                 |
| 2.6   | Dosazení vojvody do vsi bez muže rodu                  | ≈ 130 | 2.1, 1.7            |
| 3.1   | Doména jednání a stromu dohod                          | ≈ 120 | –                   |
| 3.2   | DB jednání a blokování                                 | ≈ 130 | 3.1, 1.3            |
| 3.3   | Use-casy jednání, holá přísaha, upozornění, kronika    | ≈ 140 | 3.2, 1.5, 1.7, 1.9  |
| 3.4   | Rozhraní jednání                                       | ≈ 140 | 3.3, 1.10           |
| 4.1   | Makrokomodity a výhled „kolik můžu postrádat“          | ≈ 140 | –                   |
| 4.2   | Podmínky vazalství, nové podmínky, vypovězení          | ≈ 150 | 3.3, 4.1            |
| 4.3   | Zásilky mezi vsemi hráčů                               | ≈ 150 | 1.7, 4.1            |
| 4.4   | Dialogy a roční Odvody 1. 11.                          | ≈ 150 | 4.2, 4.3            |
| 4.5   | Lidé a robota                                          | ≈ 130 | 4.4                 |
| 4.6   | Pomoc na žádost, dar a půjčka                          | ≈ 130 | 4.4                 |
| 4.7   | Obchod mezi hráči                                      | ≈ 110 | 4.4                 |
| 4.8   | Správa cizí vsi a řízení víc vsí                       | ≈ 150 | 2.2, 3.3            |
| 4.9   | Povýšení vesničana a NPC rod                           | ≈ 140 | 4.8                 |
| 4.10  | Vymření rodu a odúmrť                                  | ≈ 150 | 4.2, 4.8            |
| 5.1   | Obvod opevnění – geometrie, úseky, brány, cena         | ≈ 130 | –                   |
| 5.2   | Stavba opevnění po úsecích                             | ≈ 150 | 5.1 (4.5 volitelně) |
| 5.3   | Brány v síti cest, vozy a stáda                        | ≈ 140 | 5.2                 |
| 5.4   | Životnost, údržba valu a přestavba úseků               | ≈ 110 | 5.2                 |
| 5.5   | Obrana opevnění – násobky, útočiště, prolomení         | ≈ 120 | 5.1, 5.4            |
| 5.6   | Rozhraní opevnění                                      | ≈ 140 | 5.3                 |
| 5.7   | Opevnění ve scéně                                      | ≈ 150 | 5.3, 5.4            |
| 5.8   | Správce staví opevnění podle hrozby                    | ≈ 120 | 5.2, 5.5, 1.6       |
| 6.1   | Sjednocení war.md, stropy výcviku, síla                | ≈ 120 | –                   |
| 6.2   | Válka, ochrana nováčka a vsi, opověď                   | ≈ 140 | 3.3                 |
| 6.3   | Mírové jednání a jeho podmínky                         | ≈ 130 | 6.2, 4.4            |
| 6.4   | Pohyb vojska mapu po mapě (doména)                     | ≈ 150 | 1.2, 5.3            |
| 6.5   | Tažení po taktech – jádro, úložiště, smyčka workeru    | ≈ 150 | 6.4                 |
| 6.6   | Příprava a vyslání tažení, panel Vojsko                | ≈ 150 | 6.1, 6.5            |
| 6.7   | Ves a tažení – bariéra a dny nájezdu                   | ≈ 150 | 6.5, 1.7            |
| 6.8   | Boj muž po muži                                        | ≈ 150 | 6.5, 5.5            |
| 6.9   | Obránci – postoje, včasný útěk, skryté jámy            | ≈ 140 | 6.8                 |
| 6.10  | Výsledky nájezdu ve vsi a kořist                       | ≈ 140 | 6.7, 6.8            |
| 6.11  | Vzdaní, zajetí a výkupné                               | ≈ 140 | 6.10, 3.3           |
| 6.12  | NPC velitel, zástupce, rozpad                          | ≈ 130 | 6.8                 |
| 6.13  | Průchod, svolání vazalů, ochrana pánem                 | ≈ 150 | 4.2, 6.6            |
| 6.14  | Živé vedení a pohled na cizí mapu                      | ≈ 150 | 6.12                |
| 6.15  | Scéna války                                            | ≈ 150 | 6.14, 5.7           |
| 6.16  | Rozsudek pána                                          | ≈ 110 | 4.4, 6.2            |
| 6.17  | Měření tažení a e2e celé války                         | ≈ 120 | vše F6              |

**Souběžně** (jen když Martin pustí víc proudů – paměť „jeden proud“): čistě doménové úlohy
1.1, 1.6, 3.1, 4.1, 5.1, 5.4, 5.5, 6.1 a 6.4 nemají společné soubory a jdou kdykoli; F2 může běžet
vedle F3 (práva vs. jednání). **F5 Opevnění** nepotřebuje druhého hráče a jde vedle kterékoli
z F1–F4 (nejméně střetů vedle F2–F3; Ú5.2 sahá na `types-state.ts` a `simulate-build.ts` jako
Ú1.6 – po ní) – jen Ú5.8 čeká na Ú1.6 a celá F5 musí být hotová před Ú6.4, 6.8 a 6.9. Jinak
sériově v pořadí tabulky. Každá úloha vlastní větev z `feat/multiplayer` (ta z `feat/landscape`);
Ú5.1–5.7 z `feat/landscape` (Fáze 5 – Kdy).

---

## Fáze 1 – Svět pro víc hráčů

**Hráč na konci uvidí:** zaregistruje se a dostane mapu ve společném světě (nezávislý blízko
středu, pozvaný blízko pána); v panelu „Rod a vazalové“ (prapor v horní liště) vidí ostatní rody
podle vzdálenosti s muži rodu od 16 let a jejich věkem, vydá a zruší pozvánku; pozvaný je jeho
vazalem (holá přísaha) a pán dostane upozornění. Odchod syna na políčko jiného rodu je zašedlý.

**Rizika:** převod vývojových dat do společné mřížky (kolize políček – řeší migrace + test);
schránka mění srdce dopočtu (`advanceVillageSteps`) – test „po kouscích“ a souběh web × worker ×
zápis; bezpečnost adresáře rodů (jen veřejná pole – test tvaru odpovědi); registrace s kódem přes
Google (kód v cookie přes OAuth).

### Úloha 1.1 – Mřížka světa a umístění nováčka (≈ 100 kroků)

**Soubory:** nové `packages/game/src/domain/world/{placement.ts,cell-seed.ts,rules-world.ts,index.ts}`,
`domain/world/__tests__/placement.test.ts`; `packages/game/src/domain/index.ts` (export).

**Rozhraní – vytváří:** `cellDistance(a: GridCell, b: GridCell): number`;
`ringCells(center: GridCell, radius: number): GridCell[]` (pevné pořadí: začíná severem, po směru
hodin); `placeNewPlayer(occupied: readonly OccupiedCell[], request: PlacementRequest): GridCell`,
`PlacementRequest = { kind: 'independent' } | { kind: 'invited'; lordSeat: GridCell }`;
`cellLandscapeSeed(worldSeed: number, cell: GridCell): number` (přes `deriveSeed`);
`WORLD = { independentGap: 3, invitedGap: 2, travelDaysPerCell: 2 }` (vassalage.md – Místo na mapě
světa, Doprava).

- [ ] Test `placement.test.ts`: prázdný svět → (0, 0); druhý nezávislý má `cellDistance ≥ 3` od
      všech map prvního a je nejblíž středu; pozvaný leží nejblíž `lordSeat` a ≥ 2 od map ostatních
      hráčů (vlastní mapy pána se počítají jako „ostatní“); shoda vzdálenosti → první v pořadí
      `ringCells`; `cellLandscapeSeed(7, {x:3,y:-2})` zlatá hodnota (zapsat po prvním běhu).
- [ ] Spustit `npx vitest run src/domain/world` v `packages/game` – FAIL (modul neexistuje).
- [ ] Implementovat funkce; hledání po prstencích od cíle do prvního vyhovujícího políčka.
- [ ] Test PASS, `npm run lint` (ESLint pravidla domény platí i pro `domain/world/**` – ověřit glob
      v `eslint.config.mjs`).
- [ ] Commit `feat(game): mřížka světa a umístění nového hráče`.

### Úloha 1.2 – Společná mřížka v DB a use-casech (≈ 140 kroků)

**Soubory:** `packages/db/src/schema/settlement.ts` (index), migrace `0013_shared_world_grid.sql`
(vygenerovaná + ruční převod dat), `packages/db/src/adapters/settlement-repository.ts` (+ db test),
`packages/game/src/application/{settlements.ts,enter-game.ts,leave-village.ts,settle-steward-departures.ts}`,
`__tests__/in-memory-settlements.ts`, `packages/server/src/world.ts` (`WORLD_SEED`),
`apps/web/.env.example`, `apps/worker/.env.example`, `docs/code/landscape.md`,
`docs/code/village-people.md` (Víc vsí).

**Rozhraní – mění / vytváří:** `SettlementRepository.createSeat(input & { worldCell: WorldCell }):
Promise<Settlement | null>` (už existující sídelní → vrátí ho; políčko obsazené → null);
`SettlementRepository.create` – obsazenost **globálně**; nové `occupiedCells():
Promise<OccupiedCell[]>`; `World.seed: number`; `FOREIGN_MAP_THERE = 'Tam leží ves jiného rodu.'`.

- [ ] Schéma: zrušit `settlement_owner_grid_idx`, nový `settlement_grid_idx` unikátní (grid_x,
      grid_y) `WHERE archived_at IS NULL`. Migrace před indexem posune mapy hráče k (podle
      `min(created_at)` sídel) o `16 × k` sloupců a sídelním sídlům bez polohy dá (16 × k, 0).
- [ ] db test: dva vlastníci na stejném políčku → druhý `create` null; převod: tři hráči s mapami
      v (0, 0) a (1, 0) po migraci bez kolize (test pustí SQL migrace na čisté schéma s daty).
- [ ] `enterGame`: `placeNewPlayer(occupiedCells, { kind: 'independent' })` → `createSeat`;
      při `null` (souběh) nejvýš 5 pokusů s novým `occupiedCells`. Seed krajiny
      `cellLandscapeSeed(world.seed, cell)`; `generateAcceptedLandscape` dál hledá přijatý pokus.
- [ ] `leaveVillage` a `settleStewardDepartures`: cílové políčko jiného hráče → `FOREIGN_MAP_THERE`;
      správce zkusí další směr ze svého pořadí, záznam bez volného směru čeká jako dnes. Seed nové
      mapy z políčka místo `SeedSource`.
- [ ] Unit testy: dva hráči přes `enterGame` mají různá políčka ≥ 3 od sebe; odchod na cizí políčko
      odmítnut; správce zvolí jiný směr.
- [ ] `test:db`, `test:e2e` (village.spec – přepínač vsí na mapě vedle) beze změny.
- [ ] Commit `feat(world): společná mřížka map všech hráčů`.

### Úloha 1.3 – Rod jako záznam `house` (≈ 110 kroků)

**Soubory:** nové `packages/db/src/schema/house.ts`, `adapters/house-repository.ts` (+ db test),
`packages/game/src/application/houses.ts`, `__tests__/in-memory-houses.ts`; migrace `0014_house`
(převod: jeden živý rod každému hráči s aktivním sídlem); `enter-game.ts`, `restart-game.ts`,
`packages/server/src/deps.ts` (`houses`), `apps/web/lib/game.ts`.

**Rozhraní – vytváří:** `HouseRepository { activeOf(playerId): Promise<House | null>; byId(id):
Promise<House | null>; create(input: { playerId: string | null; kind: House['kind']; createdAt:
Date }): Promise<House>; end(houseId, at: Date, day: number): Promise<boolean>; setLord(houseId,
lord: PersonRef | null): Promise<void> }`; `GameDeps.houses`.

- [ ] Schéma `house` (id uuid, player_id null → `user`, kind, created_at, ended_at, ended_day,
      lord_village_id, lord_person_id); unikátní `(player_id) WHERE ended_at IS NULL AND kind =
'player'`.
- [ ] Test use-casu: `enterGame` založí rod jednou (dvojí volání – jeden rod); `restartGame` rod
      ukončí (`endedDay` = den konce) a další `enterGame` založí nový.
- [ ] db test adaptéru: souběžné `create` pro téhož hráče – jeden řádek.
- [ ] Commit `feat(world): rod hráče jako záznam`.

### Úloha 1.4 – Veřejný rodokmen a adresář rodů (≈ 120 kroků)

**Soubory:** `packages/game/src/domain/village/digest.ts` (`VillageDigest.lineMen`,
`VILLAGE_DIGEST_VERSION` = 2), nové `application/world-directory.ts`,
`packages/db/src/adapters/world-directory.ts` (+ db test), `__tests__/in-memory-world-directory.ts`,
`docs/code/worker.md` (Souhrn vsi).

**Rozhraní – vytváří:** `PublicLineMan { name?: string; bornDay: number }`;
`WorldDirectory.nearestHouses(center: GridCell, limit: number, excludeHouseId: string):
Promise<DirectoryEntry[]>` (`DirectoryEntry { house: House; seat: GridCell; digests:
VillageDigestRecord[] }`); use-case `housesNear(deps, { viewerId, today, limit }):
Promise<PublicHouse[]>`, `PublicHouse { houseId: string; lordName: string | null; seat: GridCell;
distance: number; men: { name: string | null; age: number; villageName: string }[]; villages:
number }` – jen muži od 16 let (vassalage.md – Přehled pána; Martin: „Souhlas“).

- [ ] Test: `PublicHouse` po `JSON.stringify` neobsahuje klíče `arms`, `horse`, `stores`, `people`,
      `weatherSeed` (tvar odpovědi – bezpečnost); muž 15 let chybí, 16 let je; řazení podle
      `distance`, nejvýš `limit`.
- [ ] `villageDigest` doplní `lineMen` ze `lineMen(state)`; starý tvar souhrnu se nepoužije
      (`isCurrentDigest`) – ves bez nového souhrnu se v adresáři načte celá jen jednou, souhrn
      dostane při dalším uložení.
- [ ] Adaptér: SQL řazení podle `greatest(abs(x − cx), abs(y − cy))` sídelního sídla, `LIMIT`;
      změřit dotaz na 1 000 rodech (ms do docs/code/world.md).
- [ ] Commit `feat(world): veřejný rodokmen a adresář rodů`.

### Úloha 1.5 – Upozornění mezi hráči (≈ 110 kroků)

**Soubory:** nové `packages/db/src/schema/player-notice.ts`, `adapters/notice-repository.ts`
(+ db test), `application/notices.ts`, `__tests__/in-memory-notices.ts`; web
`lib/player-notices.ts`, `lib/village-polling.ts`, `components/game/hud/NoticeLines.tsx`,
`app/game/actions.ts` (`markNoticesRead`).

**Rozhraní – vytváří:** `NoticeRepository { post(notice: Omit<PlayerNotice, 'id' | 'createdAt' |
'readAt'>): Promise<void>; after(playerId, afterId: number, limit: number):
Promise<PlayerNotice[]>; markRead(playerId, upToId: number): Promise<void> }`;
`PlayerNoticeKind` (rozšiřují další úlohy: `'invite-accepted'`, `'invitee-played'`…);
`playerNoticeLine(n: PlayerNotice): NoticeLine` ve webu.

- [ ] Test: `after` vrací jen upozornění daného hráče; server action nebere `playerId` ze vstupu
      (jen ze session) – test parseru vstupu.
- [ ] Dotazování: `villagePoll` vrátí i `noticesAfter(lastSeenId)`; `NoticeLines` je slije
      s vesnickými podle času; klik na upozornění otevře panel podle `kind`.
- [ ] Commit `feat(web): upozornění mezi hráči`.

### Úloha 1.6 – Schránka vsi – doména a use-casy (≈ 130 kroků)

**Soubory:** nové `packages/game/src/domain/village/inbox.ts` (+ test),
`application/inbox.ts`, `__tests__/in-memory-inbox.ts`; `domain/village/simulate.ts`,
`application/{update-village.ts,load-village.ts,advance-world.ts,dynasty-for-village.ts,advance-dynasty.ts}`,
`domain/village/types-chronicle.ts`.

**Rozhraní – vytváří:** `VillageEventBody` – zatím `{ kind: 'chronicle'; event: ChronicleEvent }`
(další druhy přidávají úlohy 2.2, 2.6, 4.3, 4.5, 5.x); `applyInboxDay(state: VillageState, day:
number, events: readonly VillageEvent[]): ChronicleEvent[]` (pořadí `seq`);
`advanceVillageSteps(state, toDay, obstacles, landscape, inbox: readonly VillageEvent[] = [])` –
události dne `d` před `simulateDaySteps(d)`, události s `day ≤ state.lastDay` se přeskočí;
port `VillageInbox { post(event: NewVillageEvent): Promise<VillageEvent | null>; pending(villageId,
afterDay: number, toDay: number): Promise<VillageEvent[]> }` (`null` = `ref` už zapsaný).

- [ ] Test „po kouscích“: ves se třemi událostmi ve dnech 5, 5, 9 dopočtená po 1 / 3 / 10 dnech
      = vcelku (stejný JSON).
- [ ] Test (Review Focus 1): událost zapsaná během dopočtu (in-memory schránka zvedne verzi vsi)
      → `updateVillage` narazí na konflikt, zopakuje se a událost použije právě jednou; zápis se
      dnem ≤ `lastDay` dostane `lastDay + 1`.
- [ ] `updateVillage` / `loadVillage` / `advancePlayer` načtou `pending(villageId, lastDay, cíl)`
      a předají je; `advanceVillage` (synchronní) beze schránky jen pro testy a měření.
- [ ] Commit `feat(game): schránka vnějších událostí vsi`.

### Úloha 1.7 – Schránka vsi – adaptér, worker, souběh (≈ 120 kroků)

**Soubory:** nové `packages/db/src/schema/village-inbox.ts`, `adapters/inbox-repository.ts`
(+ db test); migrace; `packages/server/src/deps.ts` (`inbox`),
`packages/server/src/__tests__/web-worker-race.db.test.ts`, `docs/code/world.md` (nový – schránka),
`CLAUDE.md` (řádek tabulky Mapa kódu).

- [ ] Tabulka `village_inbox` (id uuid, seq bigserial, village_id → village, day, ref text unique,
      body jsonb, created_at; index (village_id, day)).
- [ ] `post` v jedné transakci: `SELECT last_day … FOR UPDATE` vsi, vložit s
      `greatest(day, last_day + 1)`, `UPDATE village SET version = version + 1, digest_version =
digest_version + 1`; duplicitní `ref` → null bez zvednutí verze.
- [ ] db test (Review Focus 1): rozběhnutý `save` s původní verzí po `post` selže; opakovaný `post`
      se stejným `ref` nic nezdvojí.
- [ ] Souběh: do `web-worker-race.db.test.ts` třetí „proces“, který posílá události `chronicle` do
      náhodných vsí; konečný stav = dopočet jedním procesem se stejnými událostmi ve stejné dny.
- [ ] Commit `feat(db): schránka vsi v Postgresu`.

### Úloha 1.8 – Pozvánkové kódy a registrace (≈ 130 kroků)

**Soubory:** nové `packages/game/src/domain/world/invite.ts` (+ test), `application/invites.ts`,
`__tests__/in-memory-invites.ts`, `packages/db/src/schema/invite.ts`,
`adapters/invite-repository.ts` (+ db test); web `components/auth/RegisterForm.tsx`,
`app/register/page.tsx`, `lib/auth.ts` (`databaseHooks.user.create.after`), `lib/invite-cookie.ts`;
`e2e/accounts.spec.ts`.

**Rozhraní – vytváří:** `INVITE_ALPHABET` (bez O, I, L, 0, 1), `newInviteCode(random: () =>
number): string` (8 znaků), `formatInviteCode(code): string` (`BH7K-M2QX`),
`parseInviteCode(input): string | null`; `INVITES = { maxUnused: 3, validDays: 14, playedDays: 3 }`
(vassalage.md – Čísla); `InviteRepository { issue(input): Promise<Invite>; revoke(code, issuerId):
Promise<boolean>; listOf(issuerId): Promise<Invite[]>; reserve(code, userId, now): Promise<'ok' |
'invalid'>; consumeReservation(userId, now): Promise<Invite | null> }`; use-casy `issueInvite`,
`revokeInvite`, `reserveInvite` (`INVITE_INVALID = 'Pozvánka neplatí.'`).

- [ ] Testy: čtvrtý nevyužitý kód odmítnut, propadlý / zrušený / využitý místo uvolní; kód po 14
      dnech neplatí; rezervovaný kód nejde rezervovat jiným; `parseInviteCode('bh7k m2qx')` =
      `'BH7KM2QX'`; vydat smí jen hráč s živým rodem.
- [ ] Náhoda kódu z `crypto.getRandomValues` ve webu (port `RandomSource` do use-casu), kolize →
      nový kód (PK).
- [ ] Registrace: pole „Pozvánka“ (volitelné, `?pozvanka=` předvyplní), cookie `bohemia_invite`
      (httpOnly, 14 dní) i pro Google; neplatný kód → „Pozvánka neplatí.“ u pole, registrace jde
      dál bez něj (předběžná kontrola server action `checkInvite`).
- [ ] e2e: registrace s platným kódem a s neplatným.
- [ ] Commit `feat(accounts): pozvánkové kódy`.

### Úloha 1.9 – Pozvaný jako vazal u pána, aktivní dny, nástupnictví (≈ 140 kroků)

**Soubory:** nové `packages/db/src/schema/{vassalage.ts,player-activity.ts,succession-credit.ts}`,
`adapters/{vassalage-repository.ts,activity-repository.ts,succession-credit-repository.ts}` (+ db
testy), `application/{vassalages.ts,activity.ts,succession-credits.ts}`, in-memory porty;
`enter-game.ts`, `apps/web/lib/game.ts` (`gameEntryForPlayer` zapíše den),
`apps/worker/src/loop.ts` (úlohy světa jednou za minutu).

**Rozhraní – vytváří:** `VassalTerms = {}` (rozšíří 4.2); `VassalageRepository { activeOf(houseId):
Promise<Vassalage[]>; create(input): Promise<Vassalage>; end(id, reason: string, at: Date):
Promise<boolean>; edgesNear(houseId, depth: number): Promise<VassalEdge[]> }`;
`ActivityRepository.record(playerId, pragueDate: string)`, `.distinctDays(playerId)`;
`SuccessionCreditRepository { grantOnce(playerId, inviteeId, at): Promise<boolean>;
unused(playerId): Promise<number>; consumeOne(playerId, deathDay): Promise<boolean> }`;
use-case `grantSuccessionCredits(deps, { now })`; `runWorldTasks(deps, { now, today })` ve workeru.

- [ ] `enterGame` s rezervací: rod pána žije → umístění `{ kind: 'invited', lordSeat }`,
      vazalství `origin: 'invite'` s prázdnými podmínkami, upozornění pánovi `'invite-accepted'`;
      pán vymřel → nezávislý. Test obou cest a jednorázovosti kódu.
- [ ] Aktivní den = datum Europe/Prague (vstup do hry, nejvýš jednou za den – `ON CONFLICT DO
NOTHING`); `grantSuccessionCredits` připíše pozvateli kredit, když má pozvaný ≥ 3 různé dny –
      jednou za pozvaného (unikát `invitee_id`), platí i po vypovězení (test).
- [ ] Worker volá `runWorldTasks` jednou za minutu mezi koly (test smyčky s falešnými hodinami).
- [ ] Commit `feat(world): pozvaný začíná jako vazal blízko pána`.

### Úloha 1.10 – Panel „Rod a vazalové“ – první verze (≈ 140 kroků)

**Soubory:** nové `components/game/hud/HousePanel.tsx` (+ test), `lib/house-view.ts` (+ test),
ikony `public/icons/house/` (CC0, zdroj v `LICENSE.md`); `TopBar.tsx` (prapor s počtem vazalů,
pečeť s počtem čekajících věcí), `app/game/actions.ts` (`housePanel`, `issueInvite`,
`revokeInvite`), nové `e2e/multiplayer.spec.ts`, `docs/code/world.md`, `docs/code/web-ui.md`.

**Rozhraní – vytváří:** `HouseView { own: PortraitView[]; lords: HouseLinkView[]; vassals:
HouseLinkView[]; others: PublicHouseView[]; invites: InviteView[]; freeInviteSlots: number }`.

- [ ] Panel: řada portrétů vlastního rodu; páni (nezávislý – praporec rodu, popisek „Nezávislý“),
      vazalové; hráči podle vzdálenosti (portrét, štít s počtem mužů); pozvánky – pečeť s volnými
      místy, vydání ukáže kód a odkaz s tlačítkem kopírovat, vydané s přesýpacími hodinami a dny,
      křížek ruší, ikona nástupnictví u pozvaných, kteří začali hrát.
- [ ] e2e dvou kontextů: A vydá kód → B se zaregistruje s kódem → B má A v pánech, A má B ve
      vazalech a upozornění; třetí hráč C bez kódu vidí A i B v seznamu hráčů.
- [ ] Commit `feat(web): panel Rod a vazalové`.

---

## Fáze 2 – Seniorát a role ve vsi

**Hráč na konci uvidí:** hraje za svého muže (praporec v přepínači), senior má stolec a smí
stavět, vetovat a vystěhovat ve všech vsích rodu; v cizích vsích rodu jsou tlačítka zašedlá
„Rozhoduje Bořivoj.“ / „Ves vede Ctibor.“; po smrti jeho muže rozhodne los (nástupce ½), nebo
nástupnictví za pozvaného; mladší syn z losu odchází s dílem na novou mapu do 30 dní; ves bez
muže rodu dostane vojvodu z jiné vsi.

**Rizika:** práva musí projít **všemi** akčními use-casy (zapomenutá akce = díra) – test tabulkou
akcí; los a odchod jsou mimo simulaci – idempotence podle dne smrti; převod rozehraných her
(hráčův muž) jednou.

### Úloha 2.1 – Hráčův muž a vlastní ves (≈ 120 kroků)

**Soubory:** nové `application/player-lord.ts` (+ test); `houses.ts` (`setLord`),
`advance-dynasty.ts`, `dynasty-for-village.ts` (`DynastyView.playerLord`), web
`lib/village-list.ts`, `VillageSwitcher.tsx` (praporec), `docs/code/village-people.md`.

**Rozhraní – vytváří:** `playerLordOf(deps, playerId): Promise<PersonRef | null>`;
`ensurePlayerLord(deps, { playerId, today }): Promise<PersonRef | null>` (převod – seniorate.md
Převod: vojvoda první vsi se správcem vypnutým, jinak vojvoda nejstarší vsi s vojvodou; ostatním
vsím hráče zapne správce, jednou – podle `house.lord` null); `followPlayerLord` – ves na cestě
a nová ves z odchodu přenesou `PersonRef` (id lidí se při odchodu nemění).

- [ ] Testy: převod na rozehrané hře (tři vsi, první se správcem vypnutým), opakování nic nemění;
      hráčův muž odejde se synem na novou mapu → `lord.villageId` nové vsi.
- [ ] Commit `feat(game): hráčův muž a vlastní ves`.

### Úloha 2.2 – Senior a práva ve vsi (≈ 140 kroků)

**Soubory:** nové `domain/village/seniority.ts` (+ test), `application/rights.ts` (+ test);
všechny akční use-casy (`place-*.ts`, `cancel-construction.ts`, `set-steward.ts`,
`name-line-man.ts`, `leave-village.ts`, `build-trail.ts`, `build-wagon-road.ts`, `upgrade-road.ts`,
`plant-road-apples.ts`, `relocate-household.ts`, `send-expedition.ts`, `declare-hunt.ts`,
`rename-village.ts`), `player-villages.ts`, `domain/village/types-chronicle.ts` (`senior`),
`advance-dynasty.ts`.

**Rozhraní – vytváří:** `dynastySenior(villages: readonly { villageId: string; state:
VillageState }[], day: number): PersonRef | null` (nejstarší muž rodu; shoda – `bornDay`, pak
`personId`, pak `villageId`); `VillageRight = 'build' | 'veto' | 'steward' | 'nameSons' |
'sendSons' | 'evacuate' | 'ennoble' | 'dismissSteward' | 'trade' | 'war'`; `villageRights(ctx:
RightsContext): { allowed: ReadonlySet<VillageRight>; reason: string | null }`;
`requireRight(deps, { playerId, villageId, right, today }): Promise<PlayerVillage | string>`
(nahradí `findPlayerVillage` v akcích); důvody `decidesSenior(name)` = „Rozhoduje …“,
`ledBy(name)` = „Ves vede …“.

- [ ] Test tabulkou: vlastní ves – vše; senior v cizí vsi rodu – `build`, `veto`, `evacuate`;
      nesenior v cizí vsi rodu – nic (Martin 2. 11. 2026: „Jen se dívat“); ves bez vojvody
      spravovaná sám – jako vlastní; každý akční use-case odmítne bez práva (test projde seznam
      use-casů – zapomenutá akce spadne).
- [ ] Kronika „Seniorem rodu je Bořivoj“: `advanceDynasty` porovná seniora s uloženým v `house`
      a při změně pošle událost `chronicle` do všech vsí rodu (`ref` = `senior:<houseId>:<den>`).
- [ ] Commit `feat(game): seniorát a práva ve vsích rodu`.

### Úloha 2.3 – Rozhraní seniorátu (≈ 110 kroků)

**Soubory:** `lib/village-view.ts` (`VillageView.rights`), `BuildGrid.tsx`, `StewardToggle.tsx`,
`LineNamePanel.tsx`, `SelectionPanel.tsx`, `CursorReason.tsx`, `VillageSwitcher.tsx` (stolec),
`HousePanel.tsx` (portréty podle věku, stolec, praporec, pečeť s počtem nástupnictví bez losu –
popisek „Nástupnictví bez losu“, klik přepne ves), `e2e/village.spec.ts`.

- [ ] e2e: druhá ves rodu s NPC vojvodou – stavební tlačítka zašedlá s důvodem; po dev úpravě
      věku (hráčův muž seniorem) povolená.
- [ ] Commit `feat(web): seniorát v rozhraní`.

### Úloha 2.4 – Nástupnictví hráče – los a nástupnictví bez losu (≈ 140 kroků)

**Soubory:** nové `domain/village/player-lot.ts` (+ test), `application/player-succession.ts`
(+ test); `rules-lord.ts` (`PLAYER_SUCCESSION = { successorWeight: 0.5, departDays: 30 }` –
seniorate.md, Nástupnictví hráče), `houses.ts` (`succession_day`), `advance-dynasty.ts`,
`notices.ts` (`'player-succession'`).

**Rozhraní – vytváří:** `playerLotCandidates(state, deathDay, deadId): { successor: number | null;
younger: number[] }` (synové zemřelého od 16 let ve vsi); `drawPlayerLot(seed: number, deathDay,
candidates): number` (seed `deriveSeed(state.seed, 'player-lot:' + deathDay)`); use-case
`resolvePlayerSuccession(deps, { playerId, today }): Promise<PlayerSuccessionOutcome>`,
`PlayerSuccessionOutcome = { kind: 'none' } | { kind: 'successor' | 'senior' | 'oldest-lord'; lord:
PersonRef } | { kind: 'younger-son'; lord: PersonRef; deadlineDay: number }`.

- [ ] Testy: rozdělení losu na 2 000 seedech (nástupce ≈ ½, dva mladší ≈ ¼); stejný výsledek při
      dopočtu po kouscích; kredit se spotřebuje **jen místo losu** (s jediným kandidátem ne)
      a jen jednou (opakované volání); bez nástupce → senior, je-li vojvodou, jinak nejstarší
      vojvoda rodu; nikdo → `none` (konec hry jako dnes).
- [ ] Upozornění „Bořivoj zemřel. Hraješ za Ctibora.“; volání po dopočtu vlastní vsi ve webu
      i workeru (`advanceDynasty`).
- [ ] Commit `feat(game): nástupnictví hráče s losem`.

### Úloha 2.5 – Odchod mladšího syna po pohřbu (≈ 120 kroků)

**Soubory:** nové `application/player-departure.ts` (+ test); `leave-village.ts` (jméno z panelu),
`advance-dynasty.ts` (lhůta), web `RelocationControls.tsx`, `lib/departure-view.ts`,
`app/game/actions.ts` (`choosePlayerDeparture`), `e2e/village.spec.ts`.

**Rozhraní – vytváří:** `house.pending_departure` (`{ villageId; sonId; deathDay; deadlineDay }`);
`choosePlayerDeparture(deps, { playerId, direction, sonName?, today })`;
`autoPlayerDeparture(deps, { playerId, today })` (30. den: směr podle správce, jméno
`generatedLineName`, správce na cestě zapnutý).

- [ ] Testy: volba ve lhůtě – výprava hned, správce vypnutý, první zemnici umístí hráč; bez volby 30. den sama; mateřská ves má správce zapnutý; opakování nic nezdvojí.
- [ ] UI: obrys dílu, růžice směrů, přesýpací hodiny se dny, panel jména (jako výběr syna).
- [ ] Commit `feat(game): odchod mladšího syna po pohřbu`.

### Úloha 2.6 – Dosazení vojvody do vsi bez muže rodu (≈ 130 kroků)

**Soubory:** nové `domain/village/appoint-lord.ts` (+ test), `application/appoint-lord.ts` (+ test);
`inbox.ts` (tělo `lord-arrives`), `advance-dynasty.ts`, `rules-lord.ts` (cesta 2 dny na mapu).

**Rozhraní – vytváří:** `appointCandidate(villages, targetVillageId, day, exclude: readonly
PersonRef[]): PersonRef | null` (seniorate.md – Kdo); `departAppointee(state, day, personId):
AppointeeParty` (muž, manželky, svobodné děti, 25 kg jídla na člověka od 7 let);
`settleAppointee(state, day, party): ChronicleEvent[]` (nová id, `moveIntoManor`,
`dynasty.lordId`); use-case `appointLords(deps, { playerId, today })` – idempotentně podle
`VillageState.awaitingLord`.

- [ ] Testy: kandidát není vojvoda, nástupce ani hráčův muž; bez kandidáta ves čeká a zkusí se při
      dalším dopočtu; příjezd za 2 × vzdálenost dní; kronika obou vsí; po kouscích.
- [ ] Commit `feat(game): dosazení vojvody z jiné vsi rodu`.

---

## Fáze 3 – Jednání

**Hráč na konci uvidí:** u kteréhokoli hráče **Nabídnout vazalství** / **Požádat o přijetí**
(holá přísaha), protinávrh, přijetí, odmítnutí, stažení, **Blokovat**; zašedlá tlačítka
s důvodem („Je tvým pánem.“, „Jednáte už.“, „Odmítl – zkus zítra.“, „Zablokoval tě.“); kronika obou
rodů a upozornění. Vznikne síť dohod včetně víc pánů.

**Rizika:** souběh odpovědí (verze řádku jednání, `FOR UPDATE`); vzájemné vazalství (kontrola
v transakci přijetí); spam (pauza, blokování) – mez délky vzkazu.

### Úloha 3.1 – Doména jednání a stromu dohod (≈ 120 kroků)

**Soubory:** nové `domain/negotiation/{types.ts,negotiate.ts,rules-negotiation.ts,index.ts}`,
`domain/vassalage/{tree.ts,index.ts}`, testy.

**Rozhraní – vytváří:** `TermItem` – zatím `{ kind: 'oath'; lord: string; vassal: string }`
(id hráčů); přechody `openRound`, `counterRound`, `acceptNegotiation`, `rejectNegotiation`,
`withdrawRound` → `{ ok: true; negotiation } | { ok: false; reason }` (strany se střídají, role
přísahy se v protinávrhu nemění, stáhnout smí jen autor posledního kola); `canOpen(ctx:
OpenContext): string | null` (jedno otevřené mezi dvojicí, pauza po odmítnutí, blokování, vymřelý
rod); `NEGOTIATION = { pauseAfterRejectMs: 86_400_000, messageMaxChars: 500 }` (vassalage.md –
Meze); `wouldBeMutual(edges, lord, vassal): boolean`; `treeBelow(edges, houseId): string[]` (každý
jednou, kruh se zastaví); `treeAround(edges, houseIds): string[]`.

- [ ] Testy: střídání stran, nekonečně kol, stažení jen před odpovědí, pauza 1 skutečný den jen pro
      odmítnutého vůči témuž hráči, kruh A → B → C → A ve stromu jednou, vzájemné vazalství odmítnuto
      („Je tvým pánem.“).
- [ ] Commit `feat(game): doména jednání a stromu dohod`.

### Úloha 3.2 – DB jednání a blokování (≈ 130 kroků)

**Soubory:** nové `packages/db/src/schema/negotiation.ts` (`negotiation`, `negotiation_round`,
`player_block`, `negotiation_reject`), `adapters/negotiation-repository.ts` (+ db test),
`application/negotiations.ts`, `__tests__/in-memory-negotiations.ts`; migrace.

**Rozhraní – vytváří:** `NegotiationRepository { transaction<T>(fn: (tx: NegotiationTx) =>
Promise<T>): Promise<T> }`, `NegotiationTx { open(input); getForUpdate(id); addRound(id, round);
setStatus(id, status, expectedVersion): Promise<boolean>; blocks(a, b); lastReject(from, to);
vassalages: VassalageTx; notices: NoticeTx }` – účinky přijetí běží ve stejné transakci.

- [ ] Unikátní částečný index `(party_low, party_high) WHERE status = 'open'` (seřazená dvojice).
- [ ] db test (Review Focus 2): dvě souběžná přijetí téhož jednání – jedno `true`, vazalství jedno;
      přijetí souběžně se stažením – projde jedno; A → B a B → A založené naráz – jedno otevřené.
- [ ] Commit `feat(db): jednání mezi hráči`.

### Úloha 3.3 – Use-casy jednání, holá přísaha, upozornění, kronika (≈ 140 kroků)

**Soubory:** nové `application/{negotiate.ts,negotiation-effects.ts,blocks.ts}` (+ testy);
`notices.ts` (druhy `'negotiation-offer' | 'negotiation-counter' | 'negotiation-accepted' |
'negotiation-rejected' | 'negotiation-withdrawn' | 'blocked'`), `types-chronicle.ts` (zápisy
jednání), `restart-game.ts` (konec rodu ukončí jeho jednání).

**Rozhraní – vytváří:** `openNegotiation(deps, { playerId, to, items, message, now, today })`,
`counterNegotiation`, `acceptNegotiation`, `rejectNegotiation`, `withdrawNegotiation`,
`blockPlayer(deps, { playerId, target, now })`, `unblockPlayer`; registr
`NEGOTIATION_EFFECTS: Record<TermItem['kind'], NegotiationEffect>` (`oath` → vazalství
`origin: 'negotiation'`, druhý pán přibude vedle stávajících).

- [ ] Testy: přijetí ověří živé rody a vzájemnost; blokování ukončí rozběhnuté jednání, zablokovaný
      dostane upozornění a kronika obou rodů zapíše „Bořivoj zablokoval Ctibora“; stávající dohody
      blokování neruší; vzkaz nad 500 znaků odmítnut.
- [ ] Kronika do vlastní vsi obou rodů přes schránku (`ref` = `neg:<id>:<kolo>`).
- [ ] Commit `feat(game): jednání a holá přísaha`.

### Úloha 3.4 – Rozhraní jednání (≈ 140 kroků)

**Soubory:** nové `components/game/hud/{NegotiationCard.tsx,TermsForm.tsx}`,
`lib/negotiation-view.ts` (+ test); `HousePanel.tsx`, `app/game/actions.ts` (`parseTermItems`
pro vstupy), ikony (pečeť, sepjaté ruce, podaná ruka, křížek, pero, zavřená brána),
`e2e/multiplayer.spec.ts`.

**Rozhraní – vytváří:** `TERM_ROWS: Record<TermItem['kind'], TermRowComponent>` – rozšíření
formuláře dalšími řádky (4.2, 4.6, 4.7, 6.3).

- [ ] e2e: A nabídne vazalství, B dá protinávrh, A přijme → B má A v pánech; C odmítne nabídku
      A a A vidí „Odmítl – zkus zítra.“; B zablokuje A a A vidí „Zablokoval tě.“.
- [ ] Commit `feat(web): jednání v panelu Rod a vazalové`.

---

## Fáze 4 – Vazalství

**Hráč na konci uvidí:** dohodu s dávkami (výhled šedým číslem), vojenskou službou (zatím jen
podmínka – svolání ve F6), cílovou vsí a odměnou; každý 1. 11. dialog **Odvody** (domluvené / míň
/ víc, rozdělení po vsích, vzkaz), zásilky jdou karavanou a dorazí za 2 dny na políčko; lidé
a robota; žádost o pomoc, dar a půjčka se splátkami; obchod mezi hráči; správa cizí vsi
(klíč v přepínači) a víc řízených vsí; povýšení vesničana; vypovězení; odúmrť.

**Rizika:** zachování zboží (nic nevznikne ani nezmizí mezi vsemi – test bilance); výkon výhledu
(spočítat jen při otevření formuláře / dialogu, ne v každém pohledu); správce cizí vsi = jiný hráč
pod zámkem držitele (žádný vnořený zámek); odúmrť mění držitele vsí uprostřed práce workeru
(změna `owner_id` pod zámkem starého i nového držitele postupně, nikdy naráz – převod přes
„čekající odúmrť“).

### Úloha 4.1 – Makrokomodity a výhled „kolik můžu postrádat“ (≈ 140 kroků)

**Soubory:** nové `domain/vassalage/{macro.ts,spare.ts,transport.ts,rules-vassalage.ts}` (+ testy).

**Rozhraní – vytváří:** `villageSpare(state: VillageState, day: number): MacroGoods & { people:
TradePeople; laborDays: number }` (pojistka: osivo a jídlo na 2 roční potřeby, seno na zimu stád,
chovné jádro, jezdecký kůň každého muže rodu, lidé pro pole, práce mimo osev a žně);
`transportLimit(state, day, cells: number): MacroGoods` (nosič 25 kg, kláda 2 nosiči, vůz 400 /
800 kg s voly, honák 10 kusů; volná práce v listopadu); `houseSpare(villages, targetCell:
GridCell, commitments: MacroGoods): MacroGoods` = menší z přebytku po závazcích a z dopravy;
`VASSALAGE` (tabulka Čísla vassalage.md).

- [ ] Testy na Vlkovu z fixtur: ves v hladu má výhled obilí 0; vzdálený vazal (5 políček) odvede
      méně klád než blízký (1 políčko); závazky jiným pánům výhled zmenší; vůz zvětší dopravu.
- [ ] Změřit `villageSpare` na Vlkovu (ms, do docs/code/vassalage.md).
- [ ] Commit `feat(game): makrokomodity a výhled přebytku`.

### Úloha 4.2 – Podmínky vazalství, nové podmínky, vypovězení (≈ 150 kroků)

**Soubory:** `domain/negotiation/types.ts` (body `tribute { goods: MacroBundle }`, `service { men:
number; days: number }`, `target-village { villageId }`, `reward { goods: MacroBundle }`),
`application/{vassalages.ts,negotiation-effects.ts}`, nové `application/renounce.ts` (+ test);
web `TermsForm.tsx` (řádky s výhledem), `HousePanel.tsx` (ikony podmínek, Vypovědět – rozetnutý
řetěz, vzkaz, potvrzení), `app/game/actions.ts` (`houseSpareForPlayer`, `renounceVassalage`),
nové `docs/code/vassalage.md` (+ řádek v `CLAUDE.md`).

**Rozhraní – vytváří:** `VassalTerms { tribute?: MacroBundle; service?: { men: number; days:
number }; targetVillageId?: string; reward?: MacroBundle }`; přijetí nad existující dohodou =
`updateTerms(id, terms, expectedVersion)` (do přijetí platí staré); `renounceVassalage(deps, {
playerId, vassalageId, message, now, today })` – hned, upozornění celému stromu (`treeAround`),
kronika obou rodů; háček `onVassalageEnded` (4.4 smaže dialogy, 4.8 ukončí správu).

- [ ] Testy: odmítnutí nových podmínek dohodu nemění; vypovězení platí hned a ostatní dohody obou
      stran trvají; upozornění dostanou všichni nad i pod oběma stranami jednou.
- [ ] Neplnění: `VassalageRepository.addBreach(id, kind: 'levy' | 'repay' | 'summons' |
'judgment', day)` a počet v `Vassalage.breaches` (zapisují 4.4, 4.6, 6.13, 6.16); neplnění
      dohodu neukončí (vassalage.md – Neformální výpověď).
- [ ] Panel: strom pod hráčem (`treeBelow`) – vazalové vazalů odsazeně, štít s počtem mužů
      schopných služby (veřejný rodokmen bez raněných a mužů ve službě – doplní 6.10 a 6.13),
      ikony podmínek, zlomená pečeť s počtem neplnění, ikona hladu (ze souhrnu vsi).
- [ ] Commit `feat(game): podmínky vazalství a vypovězení`.

### Úloha 4.3 – Zásilky mezi vsemi hráčů (≈ 150 kroků)

**Soubory:** nové `domain/vassalage/shipment.ts` (+ test), `application/shipments.ts` (+ test),
`packages/db/src/schema/shipment.ts`, `adapters/shipment-repository.ts` (+ db test);
`types-trade.ts` (`TradeExpedition.kind?: 'shipment'`, `destination?`), `inbox.ts` (tělo
`shipment`), `lib/caravan-view.ts` (směr první mapy cesty).

**Rozhraní – vytváří:** `dispatchShipment(state, day, input: { bundle: MacroBundle; cells: number;
firstStep: Direction8 }): { ok: true; body: ShipmentBody } | { ok: false; reason: string }`
(odebere zboží a lidi – `emigrantGroups`, výprava nosičů na `4 × cells` dní);
`receiveShipment(state, day, body): ChronicleEvent[]` (zásoby, dobytek do ohrad nebo volně, lidé
`settleNewcomers` s novými id); `sendShipment(deps, { fromVillageId, toVillageId, bundle, purpose,
refId, today })` (pod zámkem držitele odesílající vsi: uložit ves → řádek `shipment` → událost
`ref` = `ship:<id>`); `reconcileShipments(deps)` ve `runWorldTasks` dopíše chybějící události.

- [ ] Testy: bilance zboží odesílatel − příjemce = 0 (lidé i dobytek); příjezd za `2 × cells` dní;
      pád mezi uložením vsi a zápisem do schránky → `reconcileShipments` doručí právě jednou; po
      kouscích na obou stranách; co je na cestě, dojde i po konci vazalství.
- [ ] Karavana ve scéně s `kind: 'shipment'` (výprava k okraji mapy ve směru první mapy).
- [ ] Commit `feat(game): zásilky mezi vsemi hráčů`.

### Úloha 4.4 – Dialogy a roční Odvody 1. 11. (≈ 150 kroků)

**Soubory:** nové `packages/db/src/schema/dialog.ts`, `adapters/dialog-repository.ts` (+ db test),
`application/{dialogs.ts,annual-levies.ts}` (+ testy), `components/game/hud/LevyDialog.tsx`;
`renounce.ts` (`onVassalageEnded`), `apps/worker/src/loop.ts` (`runWorldTasks`), `notices.ts`
(`'levy-sent'`, `'levy-pending'`).

**Rozhraní – vytváří:** `DialogRepository { openOnce(key: string, input): Promise<Dialog | null>;
bumpYears(key): Promise<void>; listOpen(playerId): Promise<Dialog[]>; answer(id, expectedStatus):
Promise<boolean>; dropFor(refId: string): Promise<void> }`; `Dialog { id; playerId; kind: 'levy' |
'trade-send' | 'fee-send' | 'escheat' | 'summons' | 'judgment'; key; year; years; body; status }`;
`openAnnualDialogs(deps, { today })` (klíč `levy:<vazalství>:<rok>`, 1. 11. herního roku,
doběhne po výpadku; čekající dialog `years + 1`); `answerLevy(deps, { playerId, dialogId, lines:
LevyAnswerLine[], split: Record<string, MacroBundle>, message, today })` → `sendShipment` za každou
ves zvlášť (zámky po sobě, ne naráz).

- [ ] Testy: míň, víc, žádná odpověď do dalšího 1. 11. (jeden dialog, `years` = 2); po vypovězení
      dialog zmizí; kronika „Ctibor odvedl 100 z 150 kg obilí“; pán dostane upozornění se vzkazem
      a co a kdy přijde; odvádějí jen vsi rodu vazala, ne spravované cizí.
- [ ] UI: řádek na pána, posuvník míň / víc u domluveného čísla, rozdělení po vsích předvyplněné
      podle přebytku, Odeslat (vůz); u pána přesýpací hodiny u čekajícího vazala.
- [ ] Commit `feat(game): roční Odvody`.

### Úloha 4.5 – Lidé a robota (≈ 130 kroků)

**Soubory:** `types-people.ts` (`Person.away?: { kind: 'labor' | 'service' | 'campaign' | 'captive'
| 'protection'; untilDay?: number; hostVillageId?: string; refId?: string }`), nové
`domain/vassalage/guests.ts` (+ test), `types-state.ts` (`VillageState.guests?: Guest[]`),
`labor.ts`, `food.ts` (hosté jedí u hostitele, nepřítomní doma ne), `inbox.ts` (`guests-arrive`),
`LevyDialog.tsx` (řádky lidé a robota).

**Rozhraní – vytváří:** `sendAway(state, day, ids, away): void`; `returnHome(state, day):
ChronicleEvent[]` (v den `untilDay`, deterministicky bez události); `hostGuests(state, day,
guests): void`; `Guest { ref: PersonRef; kind; untilDay; adult: true }`.

- [ ] Testy: robota 30 člověkodní – doma o lidi méně práce i jídla, u pána víc práce a jídla; návrat
      v pevný den; cesta se do dní nepočítá; muži rodu v předvyplnění nejsou; po kouscích.
- [ ] Commit `feat(game): lidé a robota pro pána`.

### Úloha 4.6 – Pomoc na žádost, dar a půjčka (≈ 130 kroků)

**Soubory:** `domain/negotiation/types.ts` (`aid-request { bundle; villageId }`, `gift { bundle;
fromVillageId }`, `loan { bundle; fromVillageId; schedule: LoanInstallment[] }`), nové
`domain/vassalage/loan.ts` (+ test), `packages/db/src/schema/loan.ts`, `adapters/loan-repository.ts`
(+ db test), `negotiation-effects.ts`, `annual-levies.ts` (řádky splátek).

**Rozhraní – vytváří:** `LoanInstallment { year: number; goods: MacroGoods }`;
`installmentValue(goods): number` (kg obilí z `TRADE_GOOD_VALUES`, seno – návrh Clauda v
`VASSALAGE`); splátka v jiném zboží platí podle hodnoty; účinek daru a půjčky = `sendShipment`
z věřitelovy vsi hned po přijetí (zámek držitele té vsi, ne zámek odpovídajícího).

- [ ] Testy: půjčka trvá po vypovězení, splátky chodí v Odvodech; zaplaceno jiným zbožím podle
      hodnoty; neplacení se zapíše; vymření dlužníka bez pána dluh zruší (háček pro 4.10).
- [ ] Commit `feat(game): pomoc a půjčky mezi rody`.

### Úloha 4.7 – Obchod mezi hráči (≈ 110 kroků)

**Soubory:** `domain/negotiation/types.ts` (`trade { give: MacroBundle; get: MacroBundle;
fromVillage: Record<string, string> }`), `negotiation-effects.ts` (dialog `trade-send` oběma),
`dialogs.ts`, `HousePanel.tsx` (Obchod – vůz), `TermsForm.tsx`.

- [ ] Testy: po přijetí dva dialogy; každá strana pošle celé / míň / nic; nic se nevynucuje;
      jen makrokomodity (mikrokomodita v `give` odmítnuta parserem).
- [ ] Commit `feat(game): obchod mezi hráči`.

### Úloha 4.8 – Správa cizí vsi a řízení víc vsí (≈ 150 kroků)

**Soubory:** nové `packages/db/src/schema/stewardship.ts`, `adapters/stewardship-repository.ts`
(+ db test), `application/stewardships.ts` (+ test); `rights.ts` (správa cizí vsi),
`domain/negotiation/types.ts` (`stewardship { villageId }`), `dynasty-for-village.ts` (spravované
cizí vsi v přepínači), web `lib/game.ts` (zámek držitele – `holderOf(villageId)`),
`VillageSwitcher.tsx` (klíč), `HousePanel.tsx` (Odvolat), `e2e/multiplayer.spec.ts`.

**Rozhraní – vytváří:** `StewardshipRepository { of(villageId); listByStewardHouse(houseId);
start(input); end(villageId, reason) }`; `Stewardship { villageId; stewardHouseId; holderHouseId;
kind: 'player' | 'npc'; vassalageId: string | null; since: Date }`; `holderOf(deps, villageId):
Promise<string>`; `dismissSteward(deps, { playerId, villageId })`; práva spravujícího:
`build`, `veto`, `steward`, `trade` – ne `evacuate`, `sendSons`, `ennoble`, `war`.

- [ ] Test (Review Focus 4): po odvolání akce spravujícího v té vsi odmítnuta a vsi zmizí z jeho
      přepínače; spravující nevystěhuje ani nepošle syna; vypovězení vazalství správu ukončí.
- [ ] Akce spravujícího běží pod zámkem držitele (jeden zámek); worker dopočítává ves dál u držitele.
- [ ] e2e: A nabídne B správu vsi, B přijme, postaví pole v A-ově vsi, A ho odvolá.
- [ ] Commit `feat(game): správa cizí vsi`.

### Úloha 4.9 – Povýšení vesničana a NPC rod (≈ 140 kroků)

**Soubory:** nové `domain/vassalage/ennoble.ts` (+ test), `application/ennoble.ts` (+ test);
`types-people.ts` (`Person.noble?: { houseId: string }`), `types-state.ts` (`VillageState.nobles?:
{ houseId: string; headId: number }`), `lord.ts` (výcvik šlechticů jako synů vojvody –
`trainingFamily`), `inbox.ts` (`noble-arrives`), `houses.ts` (`kind: 'npc'`), web výběr člověka
(klíč).

**Rozhraní – vytváří:** `checkEnnoble(state, personId, day): string | null` (muž od 16 let, ne
muž rodu); `ennobleVillager(deps, { playerId, fromVillageId, personId, targetVillageId, today })`
(nejvýš 1 za herní rok rodu; NPC rod + holá přísaha + správa `kind: 'npc'`; rodina se přestěhuje
za 2 dny na políčko); `setNpcTerms(deps, { playerId, vassalageId, terms })` (NPC vždy přijme);
`dismissSteward` u NPC – rod zůstane vazalem bez vsi; vymře-li NPC rod, správa se vrátí držiteli.

- [ ] Testy: druhé povýšení v témž roce odmítnuto; synové šlechtice cvičí; NPC rod nevypovídá
      a plní přesně.
- [ ] Commit `feat(game): povýšení vesničana do šlechtického stavu`.

### Úloha 4.10 – Vymření rodu a odúmrť (≈ 150 kroků)

**Soubory:** nové `application/escheat.ts` (+ test), `packages/db/src/schema/escheat.ts`,
`adapters/escheat-repository.ts` (+ db test); `restart-game.ts` / `closeDynastyDay` (konec rodu
s pánem), `settlement-repository.ts` (`transferHolder`), `dialogs.ts` (`escheat`),
`components/game/hud/EscheatDialog.tsx`, `docs/design/lord.md` (Konec rodu – odkaz na odúmrť).

**Rozhraní – vytváří:** `endHouse(deps, { houseId, day, now })` – bez pána jako dnes + vazalové
nezávislí, dluhy zaniknou; s pánem `Escheat { id; deadHouseId; lordHouseIds: string[]; villageIds;
vassalIds; status }`; **víc pánů – spravují všichni** (Martin 2. 11. 2026: „Ať spravují odúmrť
všichni“): do dohody je technickým držitelem pán s nejstarší dohodou (jen kvůli zámku a dopočtu,
vsi řídí NPC, ostatní páni „jen se dívat“) a každý pán dostane dialog s **návrhem dělení** po
celých vsích a vazalech, platí po souhlasu všech; s jedním pánem rozhodne hned (ponechat celé,
rozdělit, věnovat vazalovi – věnování je jednání `village-gift`, obdarovaný smí odmítnout).

- [ ] Testy (Review Focus 3): rod vymře s otevřeným jednáním, zásilkou na cestě, čekajícím
      dialogem a spravovanou cizí vsí – jednání `ended`, zásilka dojde, dialogy zmizí, správa
      skončí; vazalové vymřelého přejdou s podmínkami a půjčkami; jeden pán – celé i dělené
      panství; dva páni – dělení platí až po druhém souhlasu; smrt vojvody dohody nemění.
- [ ] Commit `feat(game): odúmrť vymřelého rodu`.

---

## Fáze 5 – Opevnění

**Hráč na konci uvidí:** v katalogu staveb ikonu opevnění s druhy polský plot, palisáda a val;
plochu nakreslí po čtvercích jako pole a u kurzoru vidí obrys se zakulacenými rohy, cenu podle
délky a kolik lidí se vejde do útočiště; brány vzniknou samy na cestách, další přidá kliknutím;
ves staví po úsecích (robota vazalů napřed), lidé, vozy a stáda chodí branami; panel opevnění
s délkou, stavem, branami, útočištěm a násobkem, vylepšení plotu na palisádu a nástavba na valu;
úseky stárnou a obyvatelé je sami přestavují; správce staví opevnění, když ves ohrožuje válka.
Bez války opevnění jen stojí – násobky, útočiště a prolomení použije F6.

**Kdy:** fáze nepotřebuje druhého hráče. Z F1–F4 čeká jen Ú5.8 na schránku (Ú1.6); Ú5.2 použije
hosty na robotě z Ú4.5, jsou-li (jinak háček přeskočí). Proto může běžet **souběžně s ranými
fázemi** – nejlépe vedle F2 a F3, které nesahají na stavby, cesty ani scénu; Ú5.1, 5.4 a 5.5 jsou
čistá doména a jdou kdykoli. Sériově jde po F4 a **musí být hotová před Ú6.4, 6.8 a 6.9** (válka
s opevněním počítá). Větve Ú5.1–5.7 vycházejí z `feat/landscape` a slučují se do něj,
`feat/multiplayer` je převezme sloučením nejpozději před F6; Ú5.8 vychází z `feat/multiplayer`.

**Spec:** `docs/design/fortifications.md` (Martin 3. 11. 2026: „ano“) – čísla v Čísla, poznámky
v Pro implementaci.

**Rizika:** síť cest (brány mění `villageGrid` – zlatý otisk sítě vsí bez opevnění, nový
`WALK_VERSION`); geometrie obvodu sdílená serverem a prohlížečem (jen det-math); výkon scény
(palisáda ≈ 4 kůly na metr – instance a ořez po čtvercích); příkop pod úrovní terénu (prořez,
terén má 15 samplerů).

### Úloha 5.1 – Obvod opevnění – geometrie, úseky, brány, cena (doména, ≈ 130 kroků)

**Soubory:** nové
`packages/game/src/domain/village/fortification/{outline.ts,segments.ts,gates.ts,cost.ts,index.ts}`
(+ `__tests__/outline.test.ts`, `gates.test.ts`), nové `domain/village/rules-fortifications.ts`
(`FORTIFICATIONS`), `paths/entrances.ts` (`outlineRuns` / `fenceOutline` s poloměrem rohu
parametrem – dnes `WOVEN_FENCE_CORNER_M`), `eslint.config.mjs` (det-math pravidla i pro
`domain/village/fortification/**`), `domain/index.ts` (export), nový
`docs/code/village-fortifications.md` + řádek v tabulce `CLAUDE.md`.

**Rozhraní – vytváří:** `FortKind = 'fence' | 'palisade' | 'rampart'`, `FortTop = 'fence' |
'palisade'`; `fortificationArea(cells: readonly TileCell[], grid: SquareGrid | null): FortArea |
FortAreaError` (souvislost stranou, zaplnění děr, nejméně 2 × 2); `fortificationOutline(area,
kind): FortOutline` (`runs` – rovné úseky a oblouky, vnější poloměr 1,25 / 3 / 8 m, vnitřní
0,5 m u plotu, jinak polovina; `lengthM` vnějšího okraje; pás 1 / 1,5 / 10 m; `innerAreaM2`); `fortSegments(outline):
FortSegmentShape[]` (strana okrajového čtverce, oblouk patří k úseku, kde začíná; pevné pořadí po
směru hodin od severu); `autoGates(outline, crossings: readonly Polyline[], anchor: Pos):
FortGate[]` (průsečíky s cestami, nejvýš 1 na úsek, bez průsečíku jedna nejblíž `anchor`);
`addGate(outline, gates, pos): FortGate[] | GateError`; `fortificationCost(kind, lengthM, work:
'new' | 'upgrade' | 'top'): BuildCost` (jako `fence-cost.ts`); `FORTIFICATIONS` (čísla
z fortifications.md – Čísla, kromě horizontů správce).

- [ ] Testy: 4 × 4 čtverce – délka plotu ≈ 237,9 m, palisády ≈ 234,8 m, valu ≈ 226,3 m; plocha
      útočiště ≈ 3 360 / 3 250 / 1 600 m² (zlaté hodnoty zapsat po prvním běhu); tvar L má vnitřní roh 0,5 m u plotu
      a polovinu vnějšího u palisády a valu; díra se zaplní; plochy dotýkající se jen rohem jsou nesouvislé; natočená mřížka
      30° dá tutéž délku; úseky po 15 m v pevném pořadí; cesta přes obvod → brána, dvě cesty
      v jednom úseku → jedna; bez cesty brána u kotvy; cena 100 m = čísla Martina.
- [ ] `npx vitest run src/domain/village/fortification` v `packages/game` – FAIL, implementace,
      PASS; `npm run lint` (det-math – žádné `Math.sin/cos/atan2/hypot/log` ani `**`).
- [ ] `paths/entrances.ts`: poloměr rohu parametrem, dnešní volání beze změny – zlaté otisky sítě
      pěšin a plotů projdou.
- [ ] Commit `feat(game): obvod opevnění – geometrie, úseky a brány`.

### Úloha 5.2 – Stavba opevnění po úsecích (≈ 150 kroků)

**Soubory:** `types-state.ts` (`VillageState.fortifications?: Fortification[]`), nové
`fortification/types.ts`, `types-construction.ts` (`'fortification'` s `fortificationId`,
`work: 'build' | 'upgrade' | 'top' | 'rebuild' | 'restore'`, `segmentIndex`), nové
`placement-fortifications.ts` (+ test), `placement.ts` (export), `simulate-build.ts` (práce po
úsecích), `wood.ts` (vyhrazení stromů pro úsek – zobecnit `planDwellingWood`), `costs.ts`
(`BUILD_COSTS` – cena podle délky), `cancel-construction.ts`, `labor.ts` (hosté na robotě napřed
do opevnění – jen když existuje `VillageState.guests` z Ú4.5), nové
`application/{place-fortification.ts,upgrade-fortification.ts,add-fortification-gate.ts}`
(+ testy s in-memory porty), `apps/web/app/game/actions.ts` (server actions s `villageId`),
`docs/code/village-fortifications.md`.

**Rozhraní – vytváří:** `Fortification { id: number; grid: SquareGrid | null; cells: TileCell[];
kind: FortKind; top?: FortTop; segments: FortSegment[]; gates: FortGate[]; rampartHeight?: number
}`, `FortSegment { index: number; builtDay: number | null; topBuiltDay?: number | null; state:
number; breachedDay?: number }`; `checkFortificationPlacement(state, landscape, obstacles, area,
kind): PlacementCheck` (pás nesmí přes obydlí s pozemkem, dvorec, dílnu, hřbitov, ohradu, humno,
jámu, modlu, svatyni, posvátný dub a háj ani vodu; les vyklučí; val vezme díly pole a sadu);
`placeFortification(deps, { playerId, villageId, cells, grid, kind })`,
`upgradeFortification(deps, { playerId, villageId, fortificationId, work: 'upgrade' | 'top', top?
})`, `addFortificationGate(deps, { playerId, villageId, fortificationId, position })`; důvody
`FORT_OVER_BUILDING = 'Opevnění nevede přes obydlí.'`, `FORT_OVER_WATER = 'Opevnění nevede přes
vodu.'`, `FORT_NOT_CONNECTED = 'Plocha musí být souvislá.'`, `FORT_TOUCHES = 'Opevnění se nesmí
dotknout jiného.'`.

- [ ] Testy: cena předem – klády na hromadě + stromy k mání pokryjí celou stavbu, práce se
      nečeká („Hráč staví kdy chce“); práce rovným dílem s ostatními stavbami, úseky jeden po
      druhém od brány nejblíž dvorci po směru hodin; stromy v pásu pokácené, klády do stavby; val
      vezme díl pole pod pásem; vylepšení – plot úseku stojí, dokud jeho palisáda není hotová,
      nic nevrací; nástavba jen na hotový val; zrušení – hotové úseky stojí; robota hostů napřed
      do opevnění (bez Ú4.5 přeskočit); **po kouscích** (1, 3, 10 dní + zbytek = vcelku, stejný
      JSON); starší ves bez `fortifications` beze změny.
- [ ] `test:db` – stav vsi s opevněním přes adaptér tam a zpět.
- [ ] Commit `feat(game): stavba opevnění po úsecích`.

### Úloha 5.3 – Brány v síti cest, vozy a stáda (≈ 140 kroků)

**Soubory:** `paths/fences.ts` (`villageFences` + hotové úseky opevnění s pásem šířky druhu,
brány jako branka), `paths/network-grid.ts` (`fenceBand`, `entranceCells` / `gateCells`),
`wagon-road.ts` (`wagonRoadGrid` – vůz jen branou), cesta stáda na pastvu (`pastureHerds`),
`rules-roads.ts` (`WALK_VERSION` → `routes-v7`), `fortification/gates.ts` (brána pro novou pevnou
cestu, vozovou cestu a zemskou stezku přes hotové opevnění), use-casy cest (`placeRoad`, vozová
cesta, stezka – přidají bránu), nové `paths/__tests__/fortification-paths.test.ts`,
`docs/code/village-roads.md`.

**Rozhraní – mění:** `villageFences(v, plots)` vrací i úseky opevnění – rozestavěný úsek je
průchozí jako staveniště, mezera a průlom taky.

- [ ] Testy: domácnost uvnitř chodí na pole vně nejbližší branou; vůz pro seno jen branou na
      vozové cestě; stádo na pastvu branou; mezera v rozestavěném obvodu je průchozí; nová pevná
      cesta přes hotové opevnění dostane bránu; **zlatý otisk sítě pěšin a vozové sítě vsi bez
      opevnění bit po bitu stejný** (Vlkov i testovací vsi); stejný výsledek ve webu i na serveru
      (tatáž funkce).
- [ ] `test:e2e` (village.spec – pěšiny a postavy bez opevnění beze změny).
- [ ] Commit `feat(game): brány opevnění v síti cest`.

### Úloha 5.4 – Životnost, údržba valu a přestavba úseků (≈ 110 kroků)

**Soubory:** nové `fortification/decay.ts` (+ test), `simulate.ts` (pevné pořadí dne – přestavba
úseků vedle přestaveb obydlí, údržba valu po opravách obydlí), `repair.ts` (údržba valu ze
společné práce), opuštěná ves (`abandonment` – nikdo nepřestavuje),
`docs/code/village-fortifications.md`.

**Rozhraní – vytváří:** `segmentState(fort, seg, day): number` (100 % do konce životnosti, bez
přestavby za ní rovnoměrně na 0 za 5 let); `decideFortRebuilds(state, day): Construction[]`
(dožilý úsek, průlom přednostně, obnova valu pod výškou 0,75 za ½ ceny; jen když je dřevo);
`rampartMaintenance(state, day, labor): number` (2 čd na 100 m ročně, nedodělek sníží výšku – za
50 let bez údržby 0,5).

- [ ] Testy: plot po 15 a palisáda po 20 letech – obyvatelé úsek přestaví sami (i hráčovo
      opevnění), staré kůly nic nevrátí; bez dřeva úsek chátrá a na nule je mezera; val s plnou
      údržbou drží výšku, bez ní má za 50 let 0,5; obnova valu; opuštěná ves nepřestavuje; po
      kouscích.
- [ ] Commit `feat(game): stáří a přestavba opevnění`.

### Úloha 5.5 – Obrana opevnění – násobky, útočiště, prolomení (doména pro válku, ≈ 120 kroků)

**Soubory:** nové `fortification/{defense.ts,refuge.ts,breach.ts}` (+ testy),
`fortification/index.ts`, `docs/code/village-fortifications.md`.

**Rozhraní – vytváří:** `segmentMultiplier(fort, seg, day): number` (tabulka Martina podle stavu –
úsek bez valu `1 + (m − 1) × stav`, na valu `v × (1 + (m ÷ 1,5 − 1) × stav nástavby)`, `v = 1 +
0,5 × výška`; mezera 1); `defenderMultiplier(forts, defenderPos, attackerPos, day): number`
(uvnitř obvodu proti útočníkovi vně, v bráně nebo průlomu 1,5 × násobek nejbližšího úseku, jinak
1,5 u domu); `fortGaps(fort, day, closedGates): Gap[]` (otevřené brány, mezery, průlomy);
`refugeCapacity(fort): number` (m²); `refugeAdmit(fort, arrivals: Arrival[], gateCloseTick:
number): RefugeResult` (pořadí lidé → koně a voli → skot → drobný dobytek; kdo přijde po zavření
brány nebo se nevejde, zůstane venku; zásoby domů uvnitř a 25 / 10 kg zvenku); `breachWork(fort,
seg, at: 'gate' | 'wall'): number` (mužohodin 0 / 2 / 12 / 96; val se neprolamuje – přechod
čtvrtinovým tempem `FORTIFICATIONS.rampartPace`); `breachStep(progress, men, hours):
BreachProgress` (nejvýš 4 muži na místo, průlom 4 m); `surrenderThreshold(defenders,
fortMultiplier): number` (1,5 × obránci × násobek).

- [ ] Testy: tabulka násobků s „zná místo“ (plot 1,875 … val s palisádou 4,5); útočník uvnitř jen
      1,5; shnilá palisáda na valu = val 1,5; snížený val s palisádou 2,5; útočiště 4 × 4 čtverce
      – ≈ 336 lidí za plotem, ≈ 160 za valem; pořadí při nedostatku místa; brána palisády se 4 muži
      za 3 herní hodiny, zeď za den, pátý muž na místě nezrychlí; 20 obránců za palisádou se vzdá
      až při 61 útočnících.
- [ ] Commit `feat(game): obrana opevnění – násobky, útočiště a prolomení`.

### Úloha 5.6 – Rozhraní opevnění (≈ 140 kroků)

**Soubory:** `apps/web/lib/build-items.ts` (rozcestník `variants` plot, palisáda, val – jako
ohrady), `lib/scene/field-painting.ts` a `field-cells.ts` (malování plochy, náhled obrysu pásu se
zakulacenými rohy a branami z `fortificationOutline` / `autoGates`),
`components/game/VillageGame.tsx` (`SUBMIT_SQUARES`, `startBuild('fortification', variant)`),
`components/game/hud/CursorReason.tsx`
(cena podle délky, útočiště – ikona lidí s počtem, důvody), nové
`components/game/hud/selection/fortification.tsx` (+ test), `SelectionPanel.tsx`, `Minimap.tsx`
(obvod čarou), `lib/village-view.ts` (`SceneFortification` odvozený z jádra),
`lib/village-picking.ts` (výběr úseku), nové `e2e/fortification.spec.ts`, `docs/code/web-ui.md`.

**Rozhraní – vytváří:** panel – ikona druhu, délka, stav (nejslabší úsek, oranžově za
životností), brány, útočiště (lidé, dobytek), násobek (štít s číslem), průběh stavby; tlačítka
„Vylepšit na palisádu“, „Postavit na valu plot“, „Postavit na valu palisádu“ (zašedlé s důvodem
u kurzoru), ikona brány → klik na obvod; slova jen v `Tooltip`.

- [ ] Testy komponent: panel plotu nabízí vylepšení, panel valu nástavbu; zašedlé „Chybí 120
      klád.“; cena u kurzoru roste s plochou.
- [ ] e2e `fortification.spec.ts`: dev ves – nakreslit palisádu 3 × 3 čtverce přes pevnou cestu →
      brána na cestě, cena u kurzoru, Enter postaví, panel ukáže délku a bránu; menší snímek.
- [ ] Commit `feat(web): rozhraní opevnění`.

### Úloha 5.7 – Opevnění ve scéně (≈ 150 kroků)

**Soubory:** nové `lib/scene/{fortification-layout.ts,fortification-renderer.ts,rampart-mesh.ts}`
(rozmístění bez Babylonu + testy čistých funkcí), `lib/scene/woven-fence-renderer.ts` (polský plot
opevnění – tentýž pletený plot, brána 4 m), `lib/scene/village-renderer.ts`, `lib/scene/pit-cut.ts`
(prořez příkopu – vzdálenost od úseček obvodu v záběru, nebo maska; zvolit měřením, terén má 15
samplerů), `tools/blender/fortifications.py` (kůl palisády ve 3 variantách, brána z prken, závora
– CC0) → `public/models/fortifications/*.glb` + `LICENSE.md` / `LICENSES.md`,
`lib/scene/village-construction.ts` (staveniště po úsecích), `/dev/buildings` tlačítko
**Opevnění** (plot, palisáda, val, val s palisádou, staveniště, stáří, průlom),
`docs/code/scene-village.md`.

- [ ] Palisáda: ≈ 4 kůly na metr v instancích, výška a náklon ze seedu úseku, po obloucích; ořez
      po čtvercích (předpona z `CULLED_MESHES`); val jako síť podél obvodu (násep 6 m / 2 m,
      příkop 4 m / 1,5 m), hlína zaroste trávou za 2–3 roky; nástavba na koruně; stavba po
      úsecích (žlab a kůly od brány, příkop se prohlubuje a val roste); stáří (šednutí, náklon,
      mezery); brány otevřené a zavřené; průlom. Kreslí se jen při změně (`needsRender`), importy
      z konkrétních modulů Babylonu, nejvýš 8 vertex bufferů (WebGPU).
- [ ] `measure-scenery-culling` – draw cally a trojúhelníky s palisádou 350 m zapsat do
      `docs/code/scene-village.md`; e2e menší snímek ukázky Opevnění.
- [ ] Commit `feat(scene): opevnění ve scéně`.

### Úloha 5.8 – Správce staví opevnění podle hrozby (≈ 120 kroků)

**Soubory:** nové `fortification/threat.ts` (+ test), `types-state.ts` (`VillageState.threats?:
ThreatSignal[]`), `inbox.ts` (tělo `threat-signal` – zapisují ho Ú6.7 a 6.10), `steward-extras.ts`
(krok Opevnění po posvátných místech, před cestami), `steward-plan.ts` (obvod z plánu sídla),
`rules-steward.ts` (`STEWARD.fortPaybackYears = { growth: 25, recovery: 5 }`, útočiště + 20 %),
`docs/design/steward.md` (krok v rozhodovacím pořadí – odkaz na fortifications.md),
`docs/code/village-steward.md`.

**Rozhraní – vytváří:** `ThreatSignal { kind: 'raid-here' | 'raid-house' | 'army-seen' | 'war';
day: number; endDay?: number }`; `villageThreat(signals, day): number` (`min(1, Σ váha × ½^(stáří ÷
10 let))`, válka bez úbytku do míru, paměť 50 let); `fortValue(state, day, kind, threat): { gain:
number; cost: number }` (ztráta nájezdu z kořisti 20 × 25 kg, dobytka venku a 10 % dospělých
v obilí → čd přes `squareValue`); `stewardFortificationArea(state, plan): FortArea | null`.

- [ ] Testy: hrozba 0 → správce nestaví (dnešní vsi beze změny); po signálu „nájezd na tuto ves“
      v Růstu postaví druh s nejlepším přínosem × horizont − cena; v Nouzi ne; obvod obsahuje
      obydlí, dvorec, humna a ohrady, pole ne; útočiště pojme lidi a dobytek + 20 %; hráčovo
      opevnění nemění; signál slábne s poločasem 10 let; po kouscích.
- [ ] Commit `feat(game): správce staví opevnění podle hrozby`.

## Fáze 6 – Válka

**Hráč na konci Ú6.12 uvidí:** opověď (s požadavkem) nebo přepadení, panel války a zkřížené oštěpy
v horní liště, ochranu nováčka (štít s hodinami), přípravu tažení v textovém panelu Vojsko
(velitel, zástupce, vsi, dobrovolníci a nucení, zásoby, odhad síly a cesty), tažení mapu po
mapě podle rozkazu, obranu bez obránce podle postoje vsi (výchozí útěk do lesa, s opevněním do
útočiště), útok na opevnění (zavřené brány, prolamování, průlom), padlé, raněné,
kořist, zajatce a výkupné, mír s podmínkami; vše v upozorněních a kronice. **Po Ú6.15:** živé
vedení vlastního muže na cizí mapě s mlhou války a vojsko ve scéně. Do Ú6.14 vede NPC i tažení
hráčova muže (`liveCommand: false`).

**Rizika:** výkon workeru (takty, hledání cesty) – měření v Ú6.17, cíl 20 tažení × 60 mužů
≤ 25 % jednoho jádra; bariéra zpomalí vsi u bojiště (worker je bere přednostně); determinismus
tažení (det-math, pořadí záměrů, seed); bezpečnost (záměry jen za vlastní muže, mlha na serveru);
velikost scény (WebGPU 8 bufferů).

### Úloha 6.1 – Sjednocení war.md, stropy výcviku, síla (≈ 120 kroků)

**Soubory:** `docs/design/war.md` (tělo podle Odpovědí 3. 11.: vesničan **pevná síla 0,4**, nucený
× 0,5, dovednost lov vesničana se nezavádí; zima – **únava z mrazu** místo ležení: návrh Clauda
−3 zdraví a −2 % síly za herní den venku od 1. 12. do konce února, ve vsi zastaví a +10 zdraví
a +5 % síly za den, sníh × 0,75; bod zlomu = padlí a ranění ÷ muži skupiny; tabulky Čísla
a Rozhodnutí), `rules-lord.ts` (`ARMS_CAPS = { home: 50, hunt: 70, war: 100 }`), `lord.ts`
(`trainArms` strop = menší z věku a zdroje), `hunt.ts` (den lovu = hodiny výcviku luku a jízdy se
stropem 70 – návrh Clauda: 4 h), nové `domain/village/arms-caps.ts` (`withArmsCaps` – dovednosti
nad 70 jednou na 70), nové `domain/war/{strength.ts,rules-war.ts,index.ts}` (+ testy),
`docs/code/war.md` (nový + řádek `CLAUDE.md`).

**Rozhraní – vytváří:** `militaryExperience(arms): number` = (boj + luk) ÷ 2; `lineManStrength(p:
Person, horse: Parameters<typeof riderPower>[1] | null): number` (1 + 2 × zkušenost ÷ 100, kůň
× (1 + 0,5 × jízda na koni ÷ 100) – jízda na koni jako `riderPower` v `hunt.ts`); `villagerStrength(forced: boolean, happiness: number): number` (0,4, × 0,5 nucený,
× 0,8–1,1 štěstí); `armyStrength(members, smithCoverage: number): number` (kovárna až × 1,5);
`WAR` (všechna čísla z war.md – Čísla, po sjednocení; násobky opevnění ne – ty jsou ve
`FORTIFICATIONS` z Ú5.1).

- [ ] Testy příkladů war.md: zkušenost 10 → 1,2; 50 → 2; 70 → 2,4; 90 → 2,8; jezdec s jízdou 60
      na vycvičeném koni × 1,3; nejvýš 4,5; výcvik doma se zastaví na 50, lov na 70; převod jednou.
- [ ] Commit `feat(game): stropy výcviku a síla vojska` (+ `docs: válka – tělo podle odpovědí
Martina 3. 11.` zvlášť).

### Úloha 6.2 – Válka, ochrana nováčka a vsi, opověď (≈ 140 kroků)

**Soubory:** nové `packages/db/src/schema/war.ts`, `adapters/war-repository.ts` (+ db test),
`application/{wars.ts,declare-war.ts}` (+ testy), `domain/war/protection.ts` (+ test),
`domain/negotiation/types.ts` (`war-demand { items: TermItem[] }`), web `TopBar.tsx` (zkřížené
oštěpy, štít s hodinami), nové `components/game/hud/WarPanel.tsx`, `HousePanel.tsx` (opověď –
zkřížené oštěpy u rodu, požadavek a vzkaz), `notices.ts`
(`'war-declared'`, `'protection-ending'`).

**Rozhraní – vytváří:** `War { id; houses: [string, string]; startedAt; startedDay; how:
'declared' | 'ambush'; status: 'active' | 'peace' | 'quiet' | 'extinct'; lastClashDay }`;
`houseProtectedUntil(house: House, ownAttackAt: Date | null): Date | null` (7 skutečných dní);
`villageProtected(state, day): boolean` (5 herních let – `protectionYears` z
`rules-disasters.ts`); `declareWar(deps, { playerId, target, demand, message, now, today })`
(ukončí vlastní ochranu, s požadavkem otevře jednání; přijetí = mír s těmi podmínkami);
`startWarByAttack(deps, …)` (přepadení – kronika „… přepadl … bez opovědi.“); `quietWars(deps, {
today })` (3 herní roky bez střetu – „Válka s Bořivojem utichla.“).

- [ ] Testy: opověď na rod v ochraně odmítnuta s důvodem „Ctibor je pod ochranou ještě 3 dny.“;
      vlastní opověď ochranu ukončí; válka uvnitř stromu dovolená; utichnutí.
- [ ] Commit `feat(game): válka mezi rody a ochrana nováčka`.

### Úloha 6.3 – Mírové jednání a jeho podmínky (≈ 130 kroků)

**Soubory:** `domain/negotiation/types.ts` (`peace { fee?: MacroBundle; payer?: string; vassalage?:
{ lord: string; vassal: string; terms: VassalTerms }; tribute?: { goods: MacroBundle; payer:
string }; cede?: string[]; releasePrisoners?: string[] }`), `negotiation-effects.ts`,
`annual-levies.ts` (tribut v Odvodech), nové `application/cede-village.ts` (+ test),
`WarPanel.tsx` (Nabídnout mír).

- [ ] Testy: postoupení poslední vsi rodu v nabídce není (Martin 2. 11. 2026); postoupená ves
      přejde celá, muži rodu poraženého s rodinami odejdou do jiné jeho vsi (událost jako
      `lord-arrives`), nový držitel má zapnutého správce; tribut chodí 1. 11.; poplatek = dialog
      `fee-send` plátci (celé, míň, nic → `sendShipment`); mír bez podmínek.
- [ ] Commit `feat(game): mírové jednání`.

### Úloha 6.4 – Pohyb vojska mapu po mapě (doména, ≈ 150 kroků)

**Soubory:** nové `domain/war/{march-grid.ts,march.ts,world-route.ts,season.ts}` (+ testy),
`eslint.config.mjs` (det-math pravidla pro `domain/war/**`), `application/cell-landscape.ts`
(krajina prázdného políčka z `cellLandscapeSeed`).

**Rozhraní – vytváří:** `marchGrid(landscape, obstacles, village: VillageState | null): MarchGrid`
(buňky 10 m: hustý les × ¼, voda jen brody, pevné cesty a zemská stezka vsi na mapě × 1,5; hotové
úseky opevnění neprůchodné kromě `fortGaps` z Ú5.5, val čtvrtinovým tempem);
`marchPath(grid, from, to): MarchPath` (A* jen det-math); `marchSpeed(group: GroupPace, day: number): number` (≈ 3,5 m/s
skutečného času, jezdci × 1,5, stádo × 0,5, pěší ranění × 0,75, sníh × 0,75); `worldRoute(from:
GridCell, to: GridCell, avoid: (c: GridCell) => boolean): GridCell[]` (8 směrů);
`edgeCrossing(cellFrom, cellTo, pos): Pos` (okraj → opačný okraj); `frostDay(member, outside:
boolean, day): MemberDelta`.

- [ ] Testy: 1 km po louce ≈ 4–5 min ≈ 3 herní dny; hustý les čtyřikrát pomaleji; řeka jen přes
      brod; zima pomaleji a s únavou z mrazu, zastávka ve vsi ji zastaví; do opevněné vsi jen
      branou, mezerou nebo přes val; zlatá cesta na 3 seedech.
- [ ] Commit `feat(game): pohyb vojska po mapách`.

### Úloha 6.5 – Tažení po taktech – jádro, úložiště, smyčka workeru (≈ 150 kroků)

**Soubory:** nové `domain/war/{campaign.ts,ticks.ts,campaign-types.ts}` (+ testy),
`packages/db/src/schema/campaign.ts` (`campaign`, `campaign_checkpoint`, `campaign_intent`),
`adapters/{campaign-repository.ts,campaign-lock.ts}` (+ db testy), `application/step-campaigns.ts`
(+ test), `apps/worker/src/campaign-loop.ts` (+ test), `apps/worker/src/{main.ts,config.ts}`
(`WORKER_CAMPAIGN_MS` = 1000), `docs/code/worker.md`.

**Rozhraní – vytváří:** `TICKS_PER_SECOND = 4`, `tickOfMs(ms, world)`, `dayOfTick(tick, world)`;
`CampaignState { id; warId; seed; tick; phase: 'assembling' | 'marching' | 'raiding' | 'returning'
| 'disbanded' | 'done'; members: CampaignMember[]; groups: CampaignGroup[]; supplies; loot;
captives; liveCommand: boolean; discovered: number[] }`; `CampaignIntent { tick; seq; byPlayer;
body: IntentBody }`; `stepCampaign(state, toTick, intents, world: CampaignWorld): { state;
villageEvents: NewVillageEvent[]; notices: Omit<PlayerNotice, 'id' | 'createdAt' | 'readAt'>[] }`
(čistá); `CampaignWorld { landscapeOf(cell); villageAt(villageId, day): VillageState | null; … }`;
`CampaignRepository { active(); checkpoint(id); intentsAfter(id, tick); saveCheckpoint(id, state);
addIntent(id, intent) }`; `CampaignLock.tryRun`; `stepCampaigns(deps, { nowMs })`.

- [ ] Test (Review Focus 5): tažení spočtené po 1, 7, 40 a 400 taktech = vcelku; „restart“ z
      kontrolního bodu = bez restartu; událost do vsi se stejným `ref` (`camp:<id>:<takt>:<n>`) se
      nezdvojí; záměr s taktem v minulosti odmítnut, s taktem `teď + 2` použit přesně v něm.
- [ ] Smyčka tažení ve workeru vedle smyčky vsí; chyba jednoho tažení nezastaví ostatní.
- [ ] Commit `feat(game): tažení po taktech`.

### Úloha 6.6 – Příprava a vyslání tažení, panel Vojsko (≈ 150 kroků)

**Soubory:** nové `domain/war/{muster.ts,supplies.ts}` (+ testy), `application/{plan-campaign.ts,
launch-campaign.ts}` (+ testy), `components/game/hud/ArmyPanel.tsx` (textový – výjimka),
`ManorPanel.tsx` (vstup do panelu), `app/game/actions.ts`.

**Rozhraní – vytváří:** `musterOf(state, day, relativesInTarget: (p: Person) => boolean, seed):
Muster { volunteers: number[]; willing: number; unwilling: number }` (≈ 30 % + 0,5 % za bod
štěstí nad 50, hlad víc, vdovská domácnost méně, příbuzní v cíli nechtějí – war.md, Vojsko);
`campaignSupplies(men, horses, carts, days): SupplyPlan` (1 kg obilí na muže a den, nosnost 25 /
80 / 400 kg); `CampaignPlan { commander: PersonRef; deputy: PersonRef | null; villages: { villageId;
lineMen: number[]; villagers: number[]; forced: number[] }[]; assemblyVillageId; targetVillageId;
groups; surrendered: 'kill' | 'lead' | 'leave'; food }`; `planCampaign(deps, { playerId, plan,
today }): Promise<CampaignEstimate | string>`; `launchCampaign(deps, { playerId, plan, today })`
(lidé `away: campaign`, zásoby jako výprava, rozkaz k útoku na příbuzné −5 štěstí za každého).

- [ ] Testy: vsi jen vlastního rodu (ne spravované cizí – „válka není běžné řízení“); velitel muž
      rodu od 16 let; cíl v ochraně odmítnut; dezerce 5 % / 15 % denně (pravidlo taktu – test
      ve `campaign.ts`), dezertér s příbuznými v cíli cíl varuje (`army-seen` dřív); odhad síly
      odpovídá `armyStrength`.
- [ ] Commit `feat(game): příprava a vyslání tažení`.

### Úloha 6.7 – Ves a tažení – bariéra a dny nájezdu (≈ 150 kroků)

**Soubory:** nové `application/village-holds.ts` (+ test), `adapters/village-holds.ts` (+ db test),
`update-village.ts`, `advance-world.ts`, `world-queue.ts` (přednostní vsi), `inbox.ts` (těla
`raid-day`, `army-seen` – spolu s ním `threat-signal` pro správce z Ú5.8), `step-campaigns.ts`
(opevnění vsi se stavem do `CampaignWorld.villageAt`), nové
`packages/server/src/__tests__/campaign-race.db.test.ts`.

**Rozhraní – vytváří:** `VillageHolds { limitOf(villageIds: readonly string[]): Promise<Map<string,
number>> }` (den, do kterého je spočítané každé tažení na mapě vsi nebo políčko od ní);
`WorldQueue.priorityVillages(): Promise<string[]>`; `CampaignWorld.villageAt` vrátí `null`, když
ves ještě nemá den `d − 1` – takt se zastaví a pokračuje v dalším kole.

- [ ] Souběh `campaign-race.db.test.ts`: worker vsí + smyčka tažení + web nad `bohemia_test`;
      konečné stavy vsí i tažení = jeden proces se stejnými záměry; postup do N s (žádný cyklus
      čekání).
- [ ] Testy: ves s cizím vojskem na mapě nepracuje (dny `raid-day`), po odchodu vojska den nato
      pracuje; posel z jiné vsi rodu, kterou vojsko prošlo, spustí postoj dřív.
- [ ] Commit `feat(game): ves a tažení – bariéra dopočtu`.

### Úloha 6.8 – Boj muž po muži (≈ 150 kroků)

**Soubory:** nové `domain/war/{battle.ts,defenders.ts,orders.ts}` (+ testy), `campaign.ts`.

**Rozhraní – vytváří:** `defenderRoster(state, day): Defender[]` (vesničané muži 16–44 síla 0,4,
ženy, starší a chlapci 14–15 let 0,1 jen u domu; skupiny domů blíž než 40 m); `battleTick(state,
rng)`: dohled 150 m (v lese méně), luk 20–60 m poloviční zásah ≈ 4 s (luk mají muži rodu – návrh
Clauda, vesničané bez dovednosti lovu bojují zblízka), zblízka plný ≈ 2 s, zásah `10 × síla ÷
násobek obrany` (`defenderMultiplier` z Ú5.5 – u domu 1,5, za opevněním 1,5 × násobek úseku),
prolamování brány a zdi `breachStep` (Ú5.5 – prolamující nebojují, průlom otevře mezeru), na nule
padlý / raněný 1 : 1, muž rodu raněný 2 : 3;
bod zlomu po skupinách **podle počtu** (30 % tažení, 45 % obrana); rozkazy `follow-leader`,
`attack-all`, `hold-place` (30 m), změna rozkazu jen do 30 m od velitele.

- [ ] Testy: příklad war.md (muž rodu se silou 2 vs. vesničan 0,4 – pět ran vs. pětadvacet);
      skupina uteče při 30 % / 45 %; velitel sám neuteče; **poslední muž rodu doma** neklesne pod
      10 zdraví, nevzdá se a uteče i pod řízením hráče; útok na palisádu – brána se 4 muži ≈ 3 herní
      hodiny, zeď ≈ den, obránci za ní s násobkem 3; stejný výsledek po kouscích taktů.
- [ ] Commit `feat(game): boj muž po muži`.

### Úloha 6.9 – Obránci – postoje, včasný útěk, skryté jámy (≈ 140 kroků)

**Soubory:** `types-state.ts` (`VillageState.defense?: { stance: 'defend' | 'surrender' | 'flee' }`,
výchozí `flee`), nové `domain/war/flight.ts` (+ test), `application/set-defense-stance.ts`
(+ test), `ManorPanel.tsx` (stěna štítů, bílá vlajka, stromy – popis v bublině),
`battle.ts` (vzdání při přesile 1,5×, jezdec za dva; za opevněním `surrenderThreshold` z Ú5.5),
útočiště `refugeAdmit` (Ú5.5 – postoje s opevněním, brány se zavřou na 30 m).

**Rozhraní – vytváří:** `nearestForest(obstacles, from: Pos): Pos | null`; `fleeParty(state, day):
FleeParty` (dospělý 25 kg, dítě 7–15 let 10 kg, mladší nic, dobytek celý); `pitFound(seed, pitId,
daysInGroup): boolean` (30 % po 1 herním dni ve skupině domů); bez lesa jako „vzdát se při
přesile“; návrat 1 herní den po odchodu vojska z mapy.

- [ ] Testy: zásoby a dobytek odejdou s lidmi; útočník najde jámu jen s pravděpodobností z pravidla;
      vlastní vojska a vojska pána a vazalů neškodná; s opevněním všechny tři postoje napřed do
      útočiště – kdo nestihne nebo se nevejde, u domů / do lesa; přítomný hráč dostane upozornění
      „Cizí vojsko u Kněžic!“.
- [ ] Commit `feat(game): postoje vsi a včasný útěk`.

### Úloha 6.10 – Výsledky nájezdu ve vsi a kořist (≈ 140 kroků)

**Soubory:** nové `domain/war/raid-apply.ts` (+ test), `inbox.ts` (těla `raid-result`,
`campaign-return`, `line-man-fell`, `fortification-breach` – úsek se stavem 0 a obyvatelé ho
přednostně přestaví, Ú5.4), `types-people.ts` (`Person.woundedUntil?: number`),
`labor.ts`, `lord.ts` (ranění necvičí), `burials.ts` (padlí obránci na hřbitov),
`types-chronicle.ts` (věcný zápis nájezdu).

**Rozhraní – vytváří:** `applyRaidResult(state, day, body: RaidResult): ChronicleEvent[]` (padlí,
ranění 60 dní bez práce a výcviku a 1 z 5 do 30 dní zemře – los ze seedu vsi a člověka, odvedení
pryč, kořist ze zásob podle podílu skupiny, nalezené jámy); `applyCampaignReturn(state, day, body)`
(kořist do zásob, odvedení jako noví vesničané s novými id, muži rodu zpět).

- [ ] Testy: bilance kořisti (co ubylo obránci, přibude útočníkovi, nosnost 25 kg na muže; zásoby
      a dobytek v nedobytém útočišti zůstanou);
      padlý muž rodu = smrt s nástupnictvím (lord.md a 2.4); kronika obou rodů „Nájezd Bořivoje
      z Lhoty na Kněžice bez opovědi: padli 3, raněni 2, odvedeno 5, vzato 400 kg obilí a 6 ovcí.“;
      po kouscích.
- [ ] Commit `feat(game): výsledky nájezdu a kořist`.

### Úloha 6.11 – Vzdaní, zajetí a výkupné (≈ 140 kroků)

**Soubory:** nové `packages/db/src/schema/prisoner.ts`, `adapters/prisoner-repository.ts` (+ db
test), `application/prisoners.ts` (+ test), `domain/war/surrender.ts` (+ test),
`types-state.ts` (`VillageState.prisoners?`), `domain/negotiation/types.ts` (`ransom { prisonerIds;
price: MacroBundle; vassalage?: VassalTerms }`), `ManorPanel.tsx` (portrét s pouty).

**Rozhraní – vytváří:** `surrenders(member, situation, rng): boolean` (bezvýchodná situace → 80 %,
jezdec s volnou cestou uteče); záměr `choose-surrendered { group; choice: 'kill' | 'lead' | 'leave'
}` (NPC podle plánu, šlechtice vždy zajme); `decidePrisoner(deps, { playerId, prisonerId, action:
'hold' | 'release' | 'execute' })` (propuštění → `captive-returns` domů za 2 × vzdálenost dní,
poprava → smrt a nástupnictví); zajatec jí z věznitelových zásob, nepracuje, necvičí; zajatý
hráčův muž nevede tažení ani necestuje.

- [ ] Testy: výkupné jednáním – po zaplacení propuštění; zajatý hráčův muž – vsi řídí formální
      správce; poprava hráčova muže spustí 2.4.
- [ ] Commit `feat(game): zajetí a výkupné`.

### Úloha 6.12 – NPC velitel, zástupce, rozpad (≈ 130 kroků)

**Soubory:** nové `domain/war/npc-commander.ts` (+ test), `campaign.ts` (přítomnost, zástupce,
rozpad), `notices.ts` (`'campaign-disbanded'`).

**Rozhraní – vytváří:** `npcIntents(state, world): IntentBody[]` (nejkratší cesta s objížďkou lesa
a přes brody, na mapě cíle útok na nejslabší skupinu domů v dohledu – u opevnění mezera, jinak
brána s nejkratším prolomením, nebo nenapadne, je-li síla pod 1,5 × obránci × násobek, a vezme, co
je venku –, kořist; obrat při bodu zlomu
své skupiny, padlé nebo uprchlé polovině vojska, plné nosnosti, jídle jen na cestu domů);
přítomnost `presence` – bez ní 344 taktů → zástupce (NPC), bez zástupce rozpad; padlý / zajatý
velitel → zástupce, jinak rozpad; rozpad = hloučky podle vsí domů, jen se brání.

- [ ] Testy: NPC tažení na sousední mapu s bránící se vsí doběhne deterministicky; rozpad po
      odchodu hráče bez zástupce; „Výprava Bořivoje se rozpadla.“.
- [ ] Ruční ověření v dev světě: dva účty, nájezd podle rozkazu, výsledky v kronice.
- [ ] Commit `feat(game): NPC velitel a rozpad výpravy`.

### Úloha 6.13 – Průchod, svolání vazalů, ochrana pánem (≈ 150 kroků)

**Soubory:** nové `application/{passage.ts,summons.ts,protection.ts}` (+ testy), `dialogs.ts`
(`summons`), `campaign.ts` (ohlášená vojska neškodná, „Nevěřit“), `guests.ts` (ochrana),
`WarPanel.tsx` (roh – svolání, štít s muži schopnými služby).

**Rozhraní – vytváří:** `announcePassage(deps, { playerId, house, cells, eta, message })`,
`answerPassage(deps, { playerId, passageId, trust: boolean, message })`; útok po ohlášení =
přepadení a ohlášení přestane platit pro všechny vsi rodu; `summonVassals(deps, { playerId,
warId, vassalageIds, targetVillageId })` → dialog Svolání (předvyplnění nejzdatnějšími muži rodu,
domluvené / míň / víc, dny služby za herní rok, propadne s koncem války – „Ctibor nepřišel do
války“; vazalové vazalů s cílem u A); `requestProtection` / `sendProtection` / `recallProtection`
(muži jako hosté chráněné vsi, brání se s ní podle postoje).

- [ ] Testy: do služby jen muži rodu; víc svolání do vyčerpání dnů; vazal vazala se počítá do
      služby B; ohlášený průchod – ves neutíká; „Nevěřit“ – ves podle postoje.
- [ ] Commit `feat(game): svolání, průchod a ochrana`.

### Úloha 6.14 – Živé vedení a pohled na cizí mapu (≈ 150 kroků)

**Soubory:** nové `apps/web/app/api/campaign/[id]/route.ts` (GET, `no-store`),
`application/campaign-view.ts` (+ test), `lib/foreign-map.ts`, `hooks/useCampaign.ts`;
`app/game/actions.ts` (`commandLeader`, `setGroupOrder`, `presence`, `chooseSurrendered`),
`e2e/multiplayer.spec.ts`.

**Rozhraní – vytváří:** `campaignViewFor(deps, { playerId, campaignId, sinceTick }):
Promise<CampaignView | null>` (vlastní muži celí; cizí jen v dohledu vlastních mužů; objevené
stavby z `discovered`; nic o stavu cizí vsi navíc); `commandLeader` → záměr na takt `teď + 2`
(jen vlastní živý nezajatý muž, cíl známý); `liveCommand = true`, když velitel je hráčův muž;
cizí mapa = krajina z `cellLandscapeSeed` (veřejná), vrstva překážek v prohlížeči, stavby jen
objevené.

- [ ] Test (Review Focus 4): záměr za cizího muže, za mrtvého a na neobjevený cíl odmítnut;
      `CampaignView` neobsahuje obránce mimo dohled (test se skrytými obránci v lese).
- [ ] Dotazování 2× za sekundu s interpolací; zavřená stránka = žádná přítomnost (6.12).
- [ ] e2e: hráčův muž vede tažení, hráč klikne cíl, muž jde.
- [ ] Commit `feat(web): živé vedení tažení`.

### Úloha 6.15 – Scéna války (≈ 150 kroků)

**Soubory:** nové `lib/scene/{army.ts,battle-fx.ts,fog-of-war.ts}` (+ testy čistých funkcí),
modely 0 A.D. (oštěp, štít, luk) v `public/models/` + `LICENSES.md`, `lib/scene/villager-plan.ts`
(útěk k lesu, odehnané stádo), `/dev/landscape` ukázka **Bitva**.

- [ ] Vojsko hloučky po skupinách, muži rodu na koních, ikona rozkazu nad skupinou; střelba, srážky,
      padlí leží do konce dne, ranění sedí u domů; mlha války texturou (žádný další vertex buffer);
      animace v `animate()` s `needsRender`; importy z konkrétních modulů Babylonu; zavřené brány,
      prolamování a průlom opevnění (modely a rozmístění z Ú5.7).
- [ ] e2e: menší snímek ukázky Bitva; `measure-scenery-culling` – draw cally s vojskem zapsat.
- [ ] Commit `feat(scene): vojsko a boj ve scéně`.

### Úloha 6.16 – Rozsudek pána (≈ 110 kroků)

**Soubory:** nové `application/judgment.ts` (+ test), `dialogs.ts` (`judgment`), `HousePanel.tsx`
(Rozsudek – váhy), `types-chronicle.ts` („Ctibor neposlechl pána“).

**Rozhraní – vytváří:** `fileComplaint(deps, { playerId, against, message })`,
`answerComplaint`, `judgeDispute(deps, { playerId, disputeId, verdict: { kind: 'compensation';
bundle: MacroBundle } | { kind: 'return-people'; people: TradePeople } | { kind: 'peace' } | { kind:
'dismiss' } })` (bez vyjádření po 1 skutečném dni); splnění dialogem (celé, míň, nic) →
`sendShipment`.

- [ ] Testy: žaloba jen na vazala téhož pána; rozsudek „mír“ válku nezakáže, jen ji zapíše jako
      neposlušnost.
- [ ] Commit `feat(game): rozsudek pána`.

### Úloha 6.17 – Měření tažení a e2e celé války (≈ 120 kroků)

**Soubory:** nové `apps/worker/scripts/measure-campaigns.ts`, `e2e/multiplayer-war.spec.ts`;
`docs/code/war.md`, `docs/code/worker.md` (Výkon).

- [ ] Měření: 1 / 5 / 20 tažení × 60 mužů, takty za sekundu na jedno jádro, podíl hledání cesty;
      cíl ≤ 25 % jádra pro 20 tažení (zapsat tabulku jako u workeru); 5 tažení u opevněných vsí
      (prolamování a útočiště).
- [ ] e2e: dva hráči v dev světě, A přepadne B (NPC velitel), B má výchozí postoj útěk – ves
      s dobytkem uteče do lesa, upozornění a kronika obou; A nabídne mír s tributem, B přijme.
- [ ] Commit `test(e2e): válka dvou hráčů`.

---

## Rizika napříč plánem

- **Rozsah:** F6 je nejrozsáhlejší fáze a první mechanika ve skutečném čase. Proto je rozdělená
  tak, aby po Ú6.12 byla hratelná válka bez živého řízení a scény; zbytek se dá odložit bez
  rozbití.
- **Výkon workeru:** schránka přidá jeden indexovaný dotaz na dopočet vsi; Odvody a úlohy světa
  jednou za minutu; tažení samostatnou smyčkou. Bariéra může vsi u bojiště zdržet o sekundy – měří
  Ú6.17.
- **Souběh:** pravidlo jednoho zámku drží – mezi hráči jen transakce nad vlastními tabulkami
  a schránka; tažení má vlastní zámek a na zámek hráče nečeká. Testy souběhu v Ú1.7 a Ú6.7.
- **Determinismus:** schránka i výsledky boje přicházejí v pevný herní den; tažení na taktech ze
  seedu; det-math ve `domain/war/**`.
- **Bezpečnost:** server skládá každý pohled pro přihlášeného; adresář rodů a pohled tažení mají
  testy tvaru odpovědi; server actions nikdy neberou `playerId` ze vstupu.
- **Kalibrace:** stropy výcviku mění lov rodu (war.md – kalibrace lovu) – ověřit deníkem vsí, ne
  měřením.
- **Opevnění:** mění síť cest a scénu vsí – zlatý otisk vsí bez opevnění (Ú5.3), měření draw callů
  s palisádou (Ú5.7); síla opevnění v boji (× 3 za palisádou) se ověří až válkou (Ú6.17) –
  „zkusíme to takhle a uvidíme“ (Martin 3. 11. 2026).

## Otázky na Martina

1. **Fiktivní sousedé pro obchod ve směru, kde leží mapa jiného hráče.** Dnes má každá ves
   v 8 směrech NPC souseda (obchod, nevěsty, výměna lidí). Když syn odejde vedle mapy jiného
   hráče, ve stejném směru by byl soused i skutečný rod. Doporučení: **sousedé zůstávají**
   (jsou to vsi okolí, ne mapy) – změní se až s návrhem světa (NPC vsi v mřížce). Možnosti:
   a) zůstávají; b) ve směru cizí mapy soused zmizí a obchod je jen jednáním s hráčem. Plán
   počítá s a).
2. **Kdo střílí lukem.** Návrh války dával luk mužům rodu a vesničanům s lovem aspoň 30; Martin 3. 11. 2026 lov vesničanů zrušil („všichni vesničané budou mít víceméně stejnou (a malou)
   bojovou hodnotu“). Doporučení: **luk jen muži rodu**, vesničané bojují zblízka. Možnosti:
   a) jen muži rodu; b) každý vesničan s lukem jako dnešní lovec u ok. Plán počítá s a).

## Mimo plán

- Z opevnění (`fortifications.md` – Později): prémiové terény (ostrožny, mokřady), obléhání hladem,
  věže, kamenné hradby, zapálení palisády, předhradí a hradiště jako stupeň sídla.
- Sňatky mezi rody, pověst a tituly, NPC rody s vlastní vůlí, NPC vsi ve světě, kostra řek
  a stezek, mikrokomodity mezi hráči, volné zprávy, pohled do scény cizí vsi mimo válku.
- Nasazení na VPS a odesílání e-mailů (pozvánka je kód a odkaz, e-mail nepotřebuje).
