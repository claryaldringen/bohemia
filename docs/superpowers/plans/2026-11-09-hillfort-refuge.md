# Varování, poslové a útěk do hradiště – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ves se o cizím vojsku dozví, až ho spatří vesničan kdekoli na mapě a doběhne domů; hráč
nebo správce pošle posla do hradiště pána (varuje vsi na trase, hradiště pak vsi domény), ukryje
lidi v lese, nebo je evakuuje do hradiště – jen lidi, nebo se vším, co unesou, a se stády. Skupina
jde po stezkách a vojsko ji může dostihnout; prázdnou ves nájezdník vyplení o to, co zůstalo.
V hradišti uprchlíci bydlí v útočišti, jedí napřed své, pak z hradiště, jejich muži hradiště brání;
domů se vrátí, až vojsko odtáhne. NPC rody a správce dělají totéž sami; rozhraní a scéna.

**Architecture:** Všechno, co se hýbe v čase taktů (vesničan běžící domů, posel, skupina uprchlíků),
žije v **tažení útočníka** – nová volitelná část `CampaignState.alarm` – protože jen tam je poloha
vojska a deterministický takt (`stepCampaign`). Rozhodnutí obránce jdou jako **záměry tažení od
cizího hráče** (precedens `breakout` – `order-breakout.ts`), správce a NPC rozhodují čistou funkcí
v taktu. Do stavů vsí jdou jen události schránky (odchod lidí, příchod do hradiště, dostižení,
návrat) – bez migrace DB. Varované vsi a hradiště drží bariéra dopočtu (`VillageHolds`), takže
událost dne přistane na týž den jako dnes `raid-day`. Pobyt v hradišti = hosté (`VillageState.guests`
druhu `refuge`) + `refugeStays` (jejich zásoby a stádo); návrat je use-case mimo tažení (tažení už
může být `done`).

**Tech Stack:** TypeScript 6, Vitest, Drizzle + PostgreSQL (bez migrace), Next.js 16, Babylon.js 9,
Playwright, Blender (ikony v `tools/blender`).

**Spec:** [docs/design/war.md – Varování, poslové a útěk do hradiště](../../design/war.md#varování-poslové-a-útěk-do-hradiště-schváleno-9-11-2026--implementace-čeká)
(schváleno Martinem 9. 11. 2026 včetně „Podrobnosti k provedení“ – „Ano“ k celku). Navazuje:
war.md – Obránci, postoje a útěk; Kořist; Vzdaní, zajetí a výkupné; [hillfort.md](../../design/hillfort.md)
(hradiště = ves pána, hra ho jinak nerozlišuje); [fortifications.md](../../design/fortifications.md) –
Útočiště; [vassalage.md](../../design/vassalage.md) – Ochrana vojskem.

## Co už v kódu je (a co se mění)

- **Posel z prošlé vsi** (Ú6.7, `campaign.ts` – `watchVillages`, `CampaignWorld.messengerTo`,
  `CampaignState.messengerSent`, událost `army-seen`, `VillageState.armySeen`, `planDefense({ warned })`):
  automatický posel z jiné vsi téhož hráče do cíle. **Nahradí ho** posel podle specu (rozhoduje
  hráč nebo správce, běží do hradiště). `armySeen` a `messengerSent` zůstanou v typech kvůli starým
  bodům (čtou se, nezapisují).
- **Dny nájezdu** (`raid-day` po celou dobu, kdy vojsko stojí na mapě vsi): mění se – `raid-day`
  až od chvíle, kdy je ves **varovaná** (spec: „Do té doby lidé pracují dál“). Signál hrozby
  `army-seen` pro správce jde také až s varováním.
- **Útěk do lesa při otevření boje** (`planDefense`, `fleeParty`, `ShelterReport`) zůstává pro ves,
  která se nerozhodla včas (postoj vsi platí dál). Nová volba „Ukrýt v lese“ je **včasný útěk**
  skupinou na mapě vsi.
- **Hosté** (`Guest`, `guests.ts` – jídlo, robota napřed do opevnění) a **muži z ochrany v boji**
  (`guardGuestsOf` → `GuardGuest` → `defenderRoster`) se použijí pro uprchlíky v hradišti.
- **Dohled** `inSight` (`sight.ts`, 150 m / 50 m v lese), mřížka a trasa (`marchGrid`, `marchPath`,
  `marchPathToEdge`, `worldRoute`, `edgeCrossing`), tempo `marchSpeed(GroupPace, day)`,
  `refugeCapacity` / `refugeAdmit` (`fortification/refuge.ts`), `isOverpowered`, `nearestForest`,
  `fleeParty`, `returnDayAfter` (`flight.ts`) – vše existuje a použije se.
- **Hradiště v kódu není entita** (hillfort.md – „A potřebujeme to poznat?“): jen `steward.hillfort`
  a `domainFoodDay`. Co je hradiště pro útěk, rozhoduje Otevřené 1.

## Global Constraints

- Hexagon a determinismus (CLAUDE.md): `domain/war/**` a nové `domain/village/refugees.ts` bez
  `Date.now()`, `new Date()` bez argumentu, `Math.random()`; `domain/war/**` jen det-math
  (`det-math.ts`, ESLint – bez `Math.sin/cos/atan2/hypot/log` a `**`), vzdálenosti jako čtverec,
  `Math.sqrt` jen kde je nutná délka. Los jen `tickRandom(seed tažení, takt, štítek)`.
- **Takty a JSON:** výsledek tažení nezávisí na kouscích taktů (1 / 7 / 40 / 400) ani na
  serializaci (`campaign.test.ts` – vzor); nové části `CampaignState.alarm` jsou JSON (žádné `Map`,
  `Set`, `undefined` v polích), pořadí pevné (vsi podle id, poslové a skupiny podle `refId`).
- **Čísla jen v `rules-war.ts` (`WAR.alarm`)** s odkazem na sekci návrhu; změna čísla = i text
  v war.md (sekce Čísla).
- **Události do vsí** jdou schránkou (`villageEvent`, `ref` = `camp:<id>:<takt>:<n>`): změna vsi, kterou
  bariéra drží, na **týž den** (jako `raid-day`), ostatní na **následující den** (rozhodnutí 13).
  Stav vsi v taktu = `villageAt(v, s.day)` (ke konci `d − 1`) – co tažení dnes už z vsi odvedlo
  (posel, skupina), musí samo odečíst (Review Focus 2).
- **Stav vsi:** nové části volitelné, chybějící = dnešní chování (`VillageState.refuge`,
  `refugeStays`, `Guest.bornDay`, `AwayKind` `'refuge' | 'messenger'`); převod netřeba. Aplikace
  událostí idempotentní (lidé už pryč se přeskočí, zásoby a dobytek nejvýš co ves má).
- **Server je jediná autorita:** záměr obránce ověří use-case (právo `war` k vsi – `requireRight`)
  i doména v taktu (ves je v `alarm`, je varovaná, majitel sedí, volba jde).
- Rozhraní jako 0 A.D.: ikony, slova jen v `Tooltip`, důvod u kurzoru. Doslovné texty specu:
  **Poslat posla**, **Ukrýt v lese**, **Do hradiště – jen lidé**, **Do hradiště – se vším**,
  **Vrátit se**, důvody **„Pán nemá hradiště“**, **„Nestihnou to“** (s odhadem času). Ikony jen vlastní
  CC0 z Blenderu (`tools/blender/icons.py` – sekce Ikony rozhraní), zdroj do `LICENSES.md`.
- Babylon jen z konkrétních modulů a jen ve scéně; kreslí se jen při změně (průvod a posel
  nastaví `needsRender` jen při pohybu); WebGPU nejvýš 8 vertex bufferů (postavy a stáda jako dnes).
- Komentáře a texty česky, krátká pomlčka „–“, nikdy „—“; rozhodnutí v docs „návrh Clauda“.
- Každá úloha zapíše mechaniku do své sekce `docs/code/war.md` (nová sekce **„Varování, poslové
  a útěk do hradiště“** za „Postoje vsi a včasný útěk (Ú6.9)“ – každá úloha svou odrážku),
  `village-core.md` (Nepřítomní a hosté), `world.md`, `web-ui.md`, `scene.md`, a před commitem
  projde `typecheck`, `lint`, `test`, `format:check`; adaptéry DB i `test:db`; web a scéna
  i `test:e2e` jen dotčených spec (`multiplayer-war.spec.ts`; souběžné stromy `E2E_PORT`,
  `TEST_DATABASE`, čekání na port `pgrep` s `[p]laywright`). Migraci agent nespouští (žádná není).
- Kalibraci (`measure-village`) nepouštět; `measure-campaigns.ts` jen v Ú15 (minuty).

## Review Focus

1. **Uhlíř v lese** (milíř 600 m od vsi, vojsko jde lesem 40 m od milíře) → ves varovaná v taktu
   spatření + doběh (`runTicks`), stihne odejít celá dřív, než vojsko dojde; bez milíře by se
   dozvěděla až z domů (Ú2 test b, Ú8 test a).
2. **Den odchodu:** skupina odešla v taktu 100 dne `d`, boj se otevře v taktu 300 téhož dne – stav
   vsi `villageAt` je ze včerejška, ale v boji nestojí nikdo z odešlých a kořist nebere jejich
   zásoby ani stádo (`alarmTaken` – Ú8 test e).
3. **Po kouscích taktů a přes JSON** se spatřením, poslem, odchodem, dostižením a příchodem →
   stejný stav i stejné události jako vcelku (Ú2, Ú5, Ú8).
4. **Posel přes mapu cizího rodu**: ves na trase, které vojsko škodí, je varovaná; vazal rodu
   útočníka (neškodné vojsko – `harmless`) ne (Ú5 test c).
5. **Návrat, dokud vojsko stojí na mapě vsi** → odmítnut s důvodem „Vojsko je ještě na mapě.“;
   po odtažení vrátí zbylé zásoby a celé stádo, bilance obilí host + domov + tažení = konstanta
   (Ú10 test a, b).
6. **Hráč bez správce, který nic nezvolí** → po `WAR.alarm.playerGraceTicks` rozhodne jako správce;
   s postojem `defend` / `surrender` jen pošle posla (Ú11 test b, c).

---

## Rozhodnutí plánu (návrh Clauda – implementační, pravidla nemění)

- **Stav varování v tažení** (`domain/war/alarm-types.ts`, `CampaignState.alarm?: CampaignAlarm`):
  ```ts
  type FlightMode = 'forest' | 'people' | 'all';
  interface CampaignAlarm {
    villages: AlarmVillage[]; // seřazené podle villageId
    messengers: AlarmMessenger[]; // podle refId
    flights: AlarmFlight[]; // podle refId
    nextRef: number; // refId = `${campaignId}:a<nextRef>`
  }
  interface AlarmVillage {
    villageId: string;
    owner: AlarmOwner; // kdo rozhoduje (Ú6 – port alarmOf), zapsané při prvním spatření
    seenTick: number; // první spatření (vesničanem nebo poslem)
    seenAt: { cell: GridCell; pos: Pos }; // kde vojsko viděli – odhady (Ú4)
    warnTick: number; // ves ví (doběh vesničana / příchod posla); > tick = ještě neví
    by: 'villager' | 'messenger';
    messenger?: string; // refId posla, kterého ves poslala
    flight?: string; // refId skupiny
    decided?: 'player' | 'steward';
  }
  interface AlarmMover {
    // jako CampaignGroup: políčko, poloha, zbývající políčka, úsek
    cell: GridCell;
    pos: Pos;
    route: GridCell[];
    leg: CampaignLeg | null;
    target: CampaignPlace;
  }
  interface AlarmMessenger extends AlarmMover {
    refId: string;
    fromVillageId: string;
    personId: number;
    toVillageId: string;
    mounted: boolean;
    status: 'running' | 'arrived' | 'caught';
    doneTick?: number;
  }
  interface AlarmFlight extends AlarmMover {
    refId: string;
    villageId: string;
    mode: FlightMode;
    hostVillageId: string | null;
    people: { id: number; bornDay: number; man: boolean; line: boolean }[];
    foodKg: number;
    herd: Record<HerdSpecies, number>;
    carts: number;
    status: 'marching' | 'arrived' | 'hidden' | 'caught';
    departTick: number;
    doneTick?: number;
  }
  ```
- **Pohyb posla a skupiny** = pohyb skupiny vojska: z `campaign.ts` se vytáhne `moveGroups` /
  `planLeg` do `domain/war/movement.ts` (`Mover`, `stepMover(m, meadowM, day, ctx)`), vojsko ho
  volá **bit po bitu** stejně (zlatý `march.test.ts` a `campaign.test.ts` beze změny). `TickContext`
  a `TickOut` se přesunou do `domain/war/campaign-tick.ts` (export) – bez změny chování.
- **Záměry obránce** (`IntentBody`): `{ kind: 'alarm-messenger'; village: string }`,
  `{ kind: 'alarm-flee'; village: string; mode: FlightMode }`, `{ kind: 'alarm-domain'; village:
string; to: string[] }` (hradiště hráče posílá posly do vybraných vsí). Filtr v `stepCampaign`:
  `isDefenderIntent(kind)` (= `breakout` a `alarm-*`) `!== (byPlayer === state.playerId)`. Doména
  záměr zahodí, když `byPlayer !== AlarmVillage.owner.playerId` nebo volba nejde (`refugeOptions`).
- **Události schránky** (`domain/village/inbox.ts`, `VillageEventBody`): `messenger-out`,
  `messenger-back`, `messenger-caught`, `refuge-depart`, `refuge-hidden`, `refuge-caught`,
  `refuge-arrive` (hostitel), `refuge-back` (domov). Tvar v Ú1, aplikace v Ú7.
- **Stav vsi:** `VillageState.refuge?: { refId; campaignId; mode; hostVillageId?: string; departedDay;
hidden?: { foodKg; herd } }` (domov – lidé pryč, co ukryli v lese), `VillageState.refugeStays?:
RefugeStay[]` (hradiště – `{ refId, fromVillageId, fromName, foodKg, herd, arrivedDay }`),
  `PersonAway.kind` `'refuge'` (s `hostVillageId` = hradiště, bez = les) a `'messenger'`,
  `Guest.bornDay?` (host jí a pracuje podle věku – dítě nepracuje; bez údaje dnešní dospělý).
  Hosté uprchlíků mají `untilDay = WAR.alarm.openUntilDay` (odejdou jen událostí návratu).
- **Kdo v lese jí:** člověk s `away.kind === 'refuge'` bez `hostVillageId` jí doma (`foodNeedPerDay`
  ho počítá), nepracuje (`laborPerDay` 0); `refugeFoodDay` napřed přesune z `refuge.hidden.foodKg`
  do zásob tolik, kolik lidé v lese sní. Uprchlíci na cestě jedí ze skupiny (`AlarmFlight.foodKg`,
  denní krok tažení), v hradišti napřed z `RefugeStay.foodKg`, pak ze zásob hradiště.
- **Žádná migrace:** `CampaignState` a stav vsi jsou jsonb; nové dotazy jen nad `campaign_checkpoint.state`
  a `village.state` (Ú3, Ú10).

---

## Otevřené – návrh Clauda

Spec ani kód tyto body nerozhodují; plán volí takto (Martin uvidí v hlášení):

1. **Co je hradiště pro útěk:** kterákoli **jiná ves** vlastního rodu nebo **přímého pána** (hrana
   vazalství, kde je rod vsi vazalem – jen jeden stupeň, smlouva je dvoustranná), která má **hotové
   opevnění s plochou** (`refugeCapacity > 0` – stejné útočiště, kam dnes utíká vlastní ves), do
   `WAR.alarm.refugeMaxCells` (8) políček. Bez takové vsi = „Pán nemá hradiště“. Víc kandidátů →
   ten s nejkratším odhadem cesty, při shodě menší id.
2. **„Stihnou to“:** skupina opustí mapu vsi (odhad `flightEtaTicks` k okraji na trase k hradišti)
   dřív, než vojsko dojde do vsi (`armyEtaTicks` – vzdušná vzdálenost od místa, kde ho viděli, ÷
   tempo pěších vojska), a trasa po světě nevede přes políčko, kde vojsko viděli. Odhad cesty =
   vzdušná vzdálenost × `WAR.alarm.routeFactor` (1,3) ÷ tempo skupiny (jen lidé × 1, se stády
   a vozy × `WAR.pace.herd`). Obránce zná jen místo spatření, ne trasu vojska (mlha války).
3. **Kde vesničané jsou („oči vsi“):** domy a dvorec vždy; díly polí mimo zimu (`isMarchWinter`
   false); milíře (`kilns[].site`), lomy (`quarries`), hromady klád (`logStacks`), sady (`orchards`),
   ohrady (`pens`) – kdekoli je práce vsi. Ves, která dnes nepracuje (`raidHiding`), má oči jen
   v domech. Dohled od polohy skupiny vojska (muži jdou v hloučku), `inSight` jako dnes. Vesničan
   běží domů po mřížce (`marchPath`) rychlostí `WAR.pace.metersPerSecond × WAR.alarm.runFactor` (2);
   vojsko ho nechytá (není to posel).
4. **Posel** = nejzdatnější dospělý muž vsi mimo muže rodu (16–44 let, ne raněný, ne pryč); bez
   takového muž rodu; bez mužů „Nikdo nemůže běžet.“. Běží `runFactor` × tempo pěších; s koněm
   ve vsi (`looseHorses` / ohrada koní) jede na koni (`WAR.pace.riders` × `runFactor`). **Chycen**,
   když je do `WAR.alarm.catchM` (30 m) od skupiny vojska, nebo v dohledu skupiny s jezdcem; osud
   podle volby ke vzdaným té skupiny (`SurrenderOrder`: pobít = padne, odvést = do kořisti jako
   odvedený, nechat = běží dál). Po doručení se vrátí domů za tolik dní, kolik běžel
   (`messenger-back`).
5. **Hradiště varuje doménu:** vsi vlastního rodu hradiště a jeho přímých vazalů do
   `WAR.alarm.domainRadiusCells` (3) políček od místa spatření, které ještě nevědí – nejbližší první,
   nejvýš `WAR.alarm.hillfortMessengers` (4) poslů. Správce hradiště a NPC hned; hráč vybere v panelu
   (`alarm-domain`), bez volby po `playerGraceTicks` jako správce.
6. **Kdo rozhoduje za hráče:** ves se zapnutým správcem (`steward.on`) a vsi NPC rodů hned
   v taktu varování; ves hráče bez správce, když hráč do `WAR.alarm.playerGraceTicks` (344 taktů =
   1 herní den ≈ 86 s) nic nezvolí, také podle pravidla správce (spec: „Správce za nepřítomného
   hráče … ano platí“). Pravidlo správce: posel vždy (je-li hradiště a kdo běžet); útěk jen
   s postojem `flee` (výchozí) – `defend` / `surrender` je hráčova volba dopředu a platí. Ves
   s vlastním opevněním s plochou správce neevakuuje (má útočiště doma).
7. **Co nesou:** „jen lidé“ = bez zásob a dobytka (spasí holý život); „se vším“ = `fleeParty`
   (dospělý 25 kg, dítě 10 kg, dobytek celý) + každý vůz se spřežením (`carts` s voly či koňmi)
   `WAR.carryKg.cart` (400 kg). „Ukrýt v lese“ = `fleeParty` jako dnešní útěk. Osivo
   (`reservedSeedKg`) a zapečetěné jámy zůstávají ve vsi jako dnes. Koně a voli jdou se skupinou
   (nejsou kořist – dnes je útočník nebere), počítají se jen do tempa.
8. **Dostižení skupiny:** skupina vojska do `catchM` od skupiny uprchlíků (cíleně je nepronásleduje
   – NPC ne, hráč rozkazem `march` může). Přesila (`isOverpowered` – útočníci skupiny vs muži
   uprchlíků) → skupina se vzdá: lidé podle volby ke vzdaným, zásoby do nosnosti a stádo do kořisti
   (`lootCapacity` jako u nájezdu), zbytek zásob zahodí. Bez přesily jde dál (boj v poli mimo ves –
   Později). Poslední muž rodu ve skupině se nevzdá – uteče do nejbližšího lesa sám.
9. **Pobyt a místo:** do útočiště hradiště napřed domácí, pak uprchlíci podle příchodu, dobytek
   všech až za lidmi (stáda první venku – spec). V boji u hradiště: muži uprchlíků od 16 let jsou
   obránci jako hosté z ochrany (`guardGuestsOf` druhu `refuge`); ženy a děti zabírají místo, ale
   nebojují; uprchlíci venku (nevešli se) jednají jako skupina domů u brány podle postoje hradiště.
   Stáda uprchlíků se pasou u hradiště, seno hostitele nejedí a nerozmnožují se; zásoby a stáda
   uprchlíků útočník při dobytí hradiště zatím nebere (Později).
10. **Robota uprchlíků:** dospělí uprchlíci pracují pro hradiště jako hosté (`guestLaborToday` –
    napřed opevnění); děti ne.
11. **Návrat:** jen po příchodu (do hradiště nebo lesa – skupina na cestě se neobrací) a jen když
    žádná skupina žádného tažení s aktivním mužem nestojí na mapě vsi. Z lesa hned (týž den), z hradiště
    za `ceil(flightEtaTicks ÷ takty dne)` dní – cesta zpět se nesimuluje (vojsko odtáhlo). Správce
    a NPC vrací `returnDayAfter(poslední den nájezdu)` (+1 den) úlohou světa.
12. **Dvě tažení najednou:** ves s `refuge` nebo už odešlými lidmi druhé tažení neevakuuje (jen
    varuje); odchod v týž den z obou tažení – druhá událost lidi a zásoby nenajde (aplikace
    idempotentní); zapsáno v Rizicích.

---

## Pořadí a souběh

| Vlna | Úlohy (souběžně)                                                         | Čeká na                     |
| ---- | ------------------------------------------------------------------------ | --------------------------- |
| A    | Ú1 čísla a typy                                                          | –                           |
| B    | Ú2 oči a varování, Ú3 bariéra (DB), Ú4 odhady a volba, Ú7 ves – události | Ú1                          |
| C    | Ú5 posel                                                                 | Ú2, Ú4                      |
| D    | Ú6 hradiště varuje doménu + svět varování, Ú10 návrat                    | Ú6: Ú5, Ú3; Ú10: Ú3, Ú7     |
| E    | Ú8 evakuace v tažení                                                     | Ú6, Ú7                      |
| F    | Ú9 pobyt a obrana, Ú11 kdo rozhoduje                                     | Ú8                          |
| G    | Ú12 pohled a příkazy                                                     | Ú9, Ú10, Ú11                |
| H    | Ú13 rozhraní, Ú14 scéna                                                  | Ú12 (Ú14 jen Ú8 + Ú12 typy) |
| I    | Ú15 e2e, měření, dokumentace                                             | vše                         |

Sdílené soubory: `campaign.ts` – Ú2, Ú5, Ú8, Ú9 (proto za sebou); `domain/war/alarm.ts` – Ú2, Ú5,
Ú6, Ú8, Ú11 (za sebou); `inbox.ts` – Ú1 (typy), Ú7 (aplikace); `step-campaigns.ts` – Ú6, Ú11;
`rules-war.ts` jen Ú1 (pozdější úloha číslo nepřidává – chybí-li, zastaví se a hlásí);
`docs/code/war.md` – každá úloha svou odrážku nové sekce (malé konflikty při slučování).

---

### Úloha 1: Čísla, typy a události (≈ 60 kroků)

**Files:**

- Modify: `packages/game/src/domain/war/rules-war.ts` (`WAR.alarm`), `campaign-types.ts`
  (`CampaignState.alarm?`, `IntentBody` – tři záměry `alarm-*`, `CampaignNoticeKind` +
  `'army-warned' | 'refuge-arrived' | 'refuge-caught' | 'messenger-caught'`),
  `packages/game/src/domain/village/types-people.ts` (`AwayKind` + `'refuge' | 'messenger'`,
  `Guest.bornDay?`), `types-state.ts` (`VillageState.refuge?`, `refugeStays?`, typy `VillageRefuge`,
  `RefugeStay`), `inbox.ts` (`VillageEventBody` – osm těl z Rozhodnutí plánu; v `applyInboxDay`
  větve zatím `break` s komentářem „Ú7“).
- Create: `packages/game/src/domain/war/alarm-types.ts` (typy z Rozhodnutí plánu, export z `index.ts`).
- Docs: `docs/design/war.md` – sekce Čísla: řádek „Varování a útěk do hradiště“ s čísly níž
  (návrh Clauda); `docs/code/war.md` – nová sekce „Varování, poslové a útěk do hradiště“ (kostra
  a odrážka Ú1).

**Interfaces (`WAR.alarm`, war.md – Varování, poslové a útěk do hradiště):**

```ts
alarm: {
  runFactor: 2,               // běh vesničana a posla = 2× pěší tempo vojska
  catchM: 30,                 // vojsko dostihne posla / skupinu (jako nález v lese)
  playerGraceTicks: 344,      // 1 herní den – pak rozhodne pravidlo správce
  refugeMaxCells: 8,          // hledání hradiště
  routeFactor: 1.3,           // odhad cesty z vzdušné čáry
  domainRadiusCells: 3,       // hradiště varuje vsi domény do 3 políček od spatření
  hillfortMessengers: 4,      // nejvýš poslů z hradiště
  openUntilDay: 999_999_999,  // hosté uprchlíků odejdou jen návratem
}
```

- [ ] **Krok 1:** typy a čísla; `typecheck` projde (nikdo je zatím nepoužívá).
- [ ] **Krok 2:** test `domain/war/__tests__/alarm-types.test.ts`: (a) `CampaignState` bez `alarm`
      po `JSON.parse(JSON.stringify())` totéž; (b) `stepCampaign` starého bodu (`campaign-fixtures.ts`)
      dá bit po bitu stejný stav jako před změnou (otisk JSON); (c) ves s `refuge-depart` v schránce
      zatím beze změny (větev `break`).
- [ ] **Krok 3:** docs, `typecheck`, `lint`, `test`, `format:check`, commit
      `feat(game): varování a útěk do hradiště – čísla a typy`.

### Úloha 2: Oči vsi a varování během do vsi (≈ 140 kroků) – po Ú1

**Files:**

- Create: `packages/game/src/domain/war/lookouts.ts`, `domain/war/alarm.ts`,
  `domain/war/campaign-tick.ts` (přesun `TickContext`, `TickOut` z `campaign.ts`),
  `domain/war/__tests__/lookouts.test.ts`, `__tests__/alarm-sight.test.ts`.
- Modify: `domain/war/campaign.ts` (`watchVillages` ř. ≈ 281: `raid-day` a `threat-signal`
  `army-seen` až od varování; automatický posel `messengerTo` pryč – nahradí Ú5; `campaignBattle`
  ř. ≈ 728: `warned` = `isWarned(s, cíl, takt)` nebo staré `armySeen`), `domain/war/index.ts`.
- Tests to change (jen v této úloze, s komentářem „war.md – Varování, 9. 11. 2026“):
  `raid-watch.test.ts` (dny nájezdu až od varování, posel z prošlé vsi zmizel), `raid-day.test.ts`
  (posel), `stance.test.ts` (posel → varování vesničanem), `packages/server/src/__tests__/campaign-race.db.test.ts`
  (dny nájezdu, posel – jen očekávané dny, průběh stejný).

**Interfaces:**

- `villageLookouts(state: VillageState, day: number): Lookout[]` – `Lookout { pos: Pos; kind:
'home' | 'field' | 'kiln' | 'quarry' | 'logs' | 'orchard' | 'pen' }` (Otevřené 3), pevné pořadí
  (druh, pak id); domy = obydlí a dvorec (`dwellings`, `manorId`).
- `runTicks(grid: MarchGrid, from: Pos, to: Pos): number` – `marchPath(grid, from, to).meadowM ÷
(WAR.pace.metersPerSecond × WAR.alarm.runFactor)` × `TICKS_PER_SECOND`, nahoru; bez cesty
  vzdušnou čarou.
- `sightAlarms(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void` – po pohybu:
  pro každou ves na mapě se skupinou s aktivním mužem (kromě `harmless`): oči vsi (mezipaměť
  `ctx.lookouts` klíč ves@den) × polohy skupin; první spatření → `AlarmVillage` (`seenTick`,
  `seenAt`, `warnTick` = takt + `runTicks` od oka do středu vsi – 0 z domu, `by: 'villager'`,
  `owner` z `ctx.world.alarmOf?.(id)` – dokud Ú6 port nedodá, `{ playerId: null, npc: true }`);
  pozdější spatření s dřívějším `warnTick` ho zkrátí. Ve `warnTick` upozornění `army-warned`
  majiteli (`watcherOf`) a `threat-signal` `army-seen`.
- `isWarned(s, villageId, tick): boolean`.
- `watchVillages`: `raid-day` jen pro ves, která je varovaná (`isWarned`), nebo na jejíž mapě se
  bojuje (`phase === 'raiding'` a cíl).

- [ ] **Krok 1:** přesun `TickContext` / `TickOut` do `campaign-tick.ts`; `npx vitest run
packages/game/src/domain/war` – vše zelené beze změny.
- [ ] **Krok 2:** testy `lookouts.test.ts`: (a) ves s milířem, lomem, polem a ohradou → oko u každého
      (pořadí pevné); (b) v lednu bez polí; (c) `raidDay === day` → jen domy; (d) dvakrát totéž.
- [ ] **Krok 3:** testy `alarm-sight.test.ts` (fixtury `campaign-fixtures.ts`, rovná mapa, vojsko jde
      k vsi): (a) vojsko 140 m od domu → `warnTick` = takt spatření; (b) **uhlíř** – milíř 600 m od
      vsi, vojsko jde 40 m od milíře → `warnTick` = spatření + `runTicks`, dřív než by vojsko došlo
      na dohled domů; (c) v lese dohled 50 m – vojsko 80 m od milíře v lese ves nevaruje; (d) `raid-day`
      až od `warnTick` (dny před tím ves pracuje); (e) neškodné vojsko (`harmless`) nic; (f) po
      1 / 7 / 40 taktech a přes JSON = vcelku; (g) upozornění `army-warned` jednou.
- [ ] **Krok 4:** pusť testy – padají; implementuj `lookouts.ts`, `alarm.ts`, zapojení v
      `campaignTick` (po `watchVillages` volat `sightAlarms`; pořadí: pohyb → spatření → dny nájezdu).
- [ ] **Krok 5:** `npm run test` – rozdíly projdi; změnit se smí jen testy ze seznamu výš.
      `march.test.ts`, `campaign.test.ts` (kousky), `battle.test.ts` beze změny – jinak zastavit a hlásit.
- [ ] **Krok 6:** `test:db` (`campaign-race.db.test.ts`), docs (war.md – Varování: oči a doběh;
      oprava sekce „Bariéra dopočtu a dny nájezdu (Ú6.7)“ – Dny nájezdu a Posel), commit
      `feat(game): ves se o vojsku dozví od vesničana, který ho spatří`.

### Úloha 3: Bariéra a dotaz na varované vsi (≈ 80 kroků) – po Ú1

**Files:**

- Modify: `packages/db/src/adapters/village-holds.ts` (CTE nad aktivními body: vedle `groups`
  a `outbox` i `state->'alarm'->'villages'[*].villageId` a `state->'alarm'->'flights'[*].hostVillageId`
  a kandidáti hradišť `state->'alarm'->'villages'[*].hosts` – viz Ú6; mez = `throughDay`),
  `packages/db/src/adapters/campaign-repository.ts` + port `packages/game/src/application/campaigns.ts`
  (`activeAlarming(villageId): Promise<string[]>` – aktivní tažení, kde je ves v `alarm.villages`,
  hostitelem skupiny nebo cílem), in-memory port v testech (`application/__tests__/` vzor
  `activeAgainst`).
- Tests: `packages/db/src/adapters/__tests__/village-holds.db.test.ts` (rozšířit),
  `campaign-repository.db.test.ts` (`activeAlarming`).

**Interfaces:** `VillageHolds.limitOf` beze změny tvaru; `CampaignRepository.activeAlarming`.
`AlarmVillage.hosts?: string[]` (kandidáti hradišť – zapisuje Ú6) přidá Ú3 do `alarm-types.ts`
jako volitelné, ať CTE má co číst.

- [ ] **Krok 1:** db testy: (a) ves 5 políček od vojska v `alarm.villages` → mez = `throughDay`;
      (b) hostitel skupiny na cestě → drží; (c) kandidát hradiště → drží; (d) tažení `done` nedrží;
      (e) `activeAlarming` – cíl, varovaná ves, hostitel; cizí ves ne; (f) bod bez `alarm` – meze jako
      dřív (bit po bitu).
- [ ] **Krok 2:** `npm run test:db -- village-holds campaign-repository` – padají; implementace
      (jeden průchod `jsonb_array_elements` na tažení jako dnes u `groups`).
- [ ] **Krok 3:** in-memory porty v testech use-casů doplnit `activeAlarming` (výchozí = `activeAgainst`).
- [ ] **Krok 4:** `test:db` celé, docs (war.md – Bariéra dopočtu: Mez vsi; Varování: bariéra),
      commit `feat(db): bariéra drží varované vsi a hradiště`.

### Úloha 4: Hradiště, odhady a volba správce – čistá doména (≈ 90 kroků) – po Ú1

**Files:**

- Create: `packages/game/src/domain/war/refuge-choice.ts`,
  `domain/war/__tests__/refuge-choice.test.ts`.

**Interfaces:**

```ts
interface RefugeHost {
  villageId: string;
  cell: GridCell;
  center: Pos;
  capacityM2: number;
}
/** Kandidát je hradiště, má-li hotové opevnění s plochou (Otevřené 1). */
function refugeHostOf(
  state: VillageState,
  geo: GridGeometry,
  cell: GridCell,
  day: number,
): RefugeHost | null;
function flightLoad(state: VillageState, day: number, mode: FlightMode): FlightLoad; // lidé, kg, stádo, vozy, GroupPace
function flightEtaTicks(
  from: { cell: GridCell; pos: Pos },
  to: { cell: GridCell; pos: Pos },
  pace: GroupPace,
  day: number,
): number;
function leaveMapTicks(
  from: Pos,
  toward: GridCell,
  home: GridCell,
  pace: GroupPace,
  day: number,
): number;
function armyEtaTicks(
  seenAt: { cell: GridCell; pos: Pos },
  village: { cell: GridCell; pos: Pos },
  day: number,
): number;
type AlarmBlock = 'no-hillfort' | 'too-late' | 'no-forest' | 'no-runner' | 'gone' | 'sent';
interface AlarmOption {
  blocked: AlarmBlock | null;
  etaTicks?: number;
  armyEtaTicks?: number;
}
function refugeOptions(
  input: RefugeOptionsInput,
): Record<'messenger' | FlightMode, AlarmOption> & { host: RefugeHost | null };
function stewardAlarmChoice(
  options,
  stance: DefenseStance,
  ownRefuge: boolean,
): { messenger: boolean; flee: FlightMode | null };
function messengerOf(
  state: VillageState,
  day: number,
): { personId: number; mounted: boolean } | null;
```

- `flightLoad`: `people` = všichni přítomní (`!isAway`); `forest` / `all` = `fleeParty` + vozy
  (Otevřené 7); tempo: jen lidé – pěší × 1, s dobytkem nebo vozy × `WAR.pace.herd`.
- `refugeOptions`: hradiště = kandidát s nejkratším `flightEtaTicks` (Otevřené 1); „stihnou“ podle
  Otevřené 2; `forest` blokuje `nearestForest` null; `messenger` blokuje `messengerOf` null nebo
  posel už běží; všechny útěky blokuje `refuge` / lidé pryč (`gone`).
- `stewardAlarmChoice` (Otevřené 6): posel, je-li hradiště; útěk jen při `flee` a bez vlastního
  útočiště – `all`, když stihnou se vším, jinak `people`, když stihnou, jinak `forest` (bez lesa nic –
  postoj při boji).

- [ ] **Krok 1:** testy: (a) pán bez opevněné vsi → `no-hillfort`; (b) hradiště 2 políčka, vojsko
      1 km → `people` i `all` jdou; vojsko 300 m → `all` `too-late`, `people` jde; vojsko u domů → oba
      `too-late`; (c) trasa přes políčko spatření → `too-late`; (d) dva kandidáti – bližší; shoda –
      menší id; (e) vozy se spřežením přidají 400 kg každý, vůz bez spřežení nic; (f) `stewardAlarmChoice`
      – `flee` + stihnou se vším = `all`; `defend` = jen posel; vlastní útočiště = jen posel; bez lesa
      a bez hradiště = nic; (g) `messengerOf` – zdatný vesničan, bez něj muž rodu, raněný ne.
- [ ] **Krok 2:** implementace (det-math, vzdálenosti po políčkách přes `GridCell` × 1920 m).
- [ ] **Krok 3:** docs (war.md – Varování: hradiště a odhady), commit
      `feat(game): hradiště pro útěk, odhad času a volba správce`.

### Úloha 5: Posel z vsi (≈ 140 kroků) – po Ú2, Ú4

**Files:**

- Create: `packages/game/src/domain/war/movement.ts` (`Mover`, `stepMover`, `planMoverLeg` – vytažené
  z `moveGroups` / `planLeg` / `gridOf`), `domain/war/messenger.ts`,
  `domain/war/__tests__/messenger.test.ts`.
- Modify: `campaign.ts` (`moveGroups` volá `stepMover`; `stepCampaign` filtr záměrů
  `isDefenderIntent`; `applyBody` – `alarm-messenger`; `dailyStep` nic), `alarm.ts` (po varování
  posel podle `owner` – zatím jen záměr hráče; správce zapojí Ú11).

**Interfaces:**

- `sendMessenger(s, villageId, tick, ctx, out): boolean` – `messengerOf(villageAt(...))`, cíl =
  hradiště z `refugeOptions` (Ú4; kandidáti z `ctx.world.refugeHostsOf?.(villageId)` – dokud Ú6
  port nedodá, `[]` = „Pán nemá hradiště“), trasa `worldRoute`, událost `messenger-out` domů na týž
  den (ves drží bariéra – je v `alarm`), `refId`.
- `moveMessengers(s, tick, ctx, out)` – po pohybu vojska: `stepMover` tempem běhu; každá ves na
  mapě, kam posel vstoupí (i výchozí a cílová), kromě `harmless` → `AlarmVillage` s `by:
'messenger'`, `warnTick` = takt, `seenAt` = spatření odesílající vsi; v cíli `status: 'arrived'`,
  `messenger-back` domů na den `dayOfTick(takt + (takt − odchod))`.
- `catchMessengers(s, tick, ctx, out)` – Otevřené 4; `messenger-caught` domů na následující den
  (`fate: 'killed' | 'led'`; odvedený do `CampaignLoot.people` jako `ledPeople`), upozornění
  `messenger-caught` majiteli vsi.
- Pořadí v taktu: pohyb vojska → spatření (Ú2) → posli (pohyb, chycení) → dny nájezdu.

- [ ] **Krok 1:** vytáhnout `movement.ts`; `campaign.test.ts`, `march.test.ts`, `raid-campaign.test.ts`
      bit po bitu beze změny.
- [ ] **Krok 2:** testy `messenger.test.ts` (tři mapy v řadě: ves A, ves B, hradiště C): (a) záměr
      `alarm-messenger` od majitele A → posel běží, B varovaná při vstupu na její mapu, C při
      příchodu, `messenger-out` / `messenger-back` do A; (b) záměr od cizího hráče zahozen; (c) ves
      vazala rodu útočníka na trase nevarovaná (`harmless`); (d) vojsko do 30 m → chycen, odvést →
      v kořisti, pobít → `messenger-caught` `killed`; jezdec v dohledu 120 m → chycen; pěší v 120 m ne;
      (e) posel na koni rychleji; (f) bez muže → záměr nic; (g) po kouscích a přes JSON = vcelku;
      (h) v boji v týž den posel mezi obránci není (Review Focus 2 – `alarmTaken` z Ú8 zatím jen
      osoby posla).
- [ ] **Krok 3:** implementace; `npm run test`; docs (war.md – Varování: posel), commit
      `feat(game): posel běží do hradiště a varuje vsi na trase`.

### Úloha 6: Hradiště varuje doménu a svět varování (≈ 110 kroků) – po Ú5, Ú3

**Files:**

- Modify: `domain/war/campaign-types.ts` (`CampaignWorld.alarmOf?(villageId): AlarmOwner | null`,
  `refugeHostsOf?(villageId): { villageId: string; cell: GridCell }[] | null`, `domainOf?(villageId):
{ villageId: string; cell: GridCell }[] | null` – null = ještě nenačteno → `MissingData`),
  `domain/war/messenger.ts` (`domainMessengers` po příchodu posla do hradiště), `campaign.ts`
  (`applyBody` – `alarm-domain`), `application/step-campaigns.ts` (`StepCampaignsDeps.watchers`
  doplnit o `alarmOwners: AlarmOwnerPort` – vzor `watcherOf` / `harmless`: async předem do map,
  synchronní dotaz v `CampaignWorld`), `application/campaigns.ts` (port `AlarmOwnerPort { ownerOf,
refugeHostsOf, domainOf }`), adaptér `packages/db/src/adapters/alarm-owners.ts` (z `house`,
  `settlement`, `vassal_edge` – ověř názvy tabulek v `packages/db/src/schema/`; hrany přes
  existující `edgesNear`), `apps/worker/src/main.ts` (zapojení – tam se skládá `watchers` přes `villageWatchers`),
  `packages/server/src/deps.ts` (`createGameDeps`, je-li port potřeba i webu).
- Create: `application/__tests__/alarm-world.test.ts`, `db/adapters/__tests__/alarm-owners.db.test.ts`.

**Interfaces:** `AlarmOwner { playerId: string | null; npc: boolean; houseId: string }`;
`refugeHostsOf` = Otevřené 1 (vsi vlastního rodu kromě sebe a přímých pánů do 8 políček, podle
vzdálenosti); `domainOf(hradiště)` = vsi rodu hradiště a přímých vazalů (Otevřené 5).
`AlarmVillage.hosts` = id kandidátů (pro bariéru Ú3) – zapíše `sightAlarms` / `moveMessengers`.

- [ ] **Krok 1:** testy domény (`messenger.test.ts` doplnit): (a) posel dorazí do hradiště NPC →
      hradiště pošle nejvýš 4 posly do nevarovaných vsí domény do 3 políček od spatření, nejbližší
      první; (b) hradiště hráče – nic, dokud nepřijde `alarm-domain` (hráč vybere vsi); (c) ves
      vazala hradiště je v doméně, vazal vazala ne.
- [ ] **Krok 2:** testy use-casu `alarm-world.test.ts` (in-memory porty): `stepCampaigns` dodá
      `alarmOf`, `refugeHostsOf`, `domainOf`; nenačtený vlastník → takt čeká a po načtení stejný
      výsledek.
- [ ] **Krok 3:** db test adaptéru (rod s pánem a vazalem, NPC rod, ves bez rodu = null vlastník).
- [ ] **Krok 4:** implementace, zapojení ve workeru i v `measure-campaigns.ts` (porty v paměti);
      `test`, `test:db`; docs (war.md – Varování: hradiště varuje doménu; world.md – odkaz), commit
      `feat(game): hradiště rozešle posly do vsí domény`.

### Úloha 7: Ves na útěku – události schránky, jídlo a hosté (≈ 120 kroků) – po Ú1

**Files:**

- Create: `packages/game/src/domain/village/refugees.ts`,
  `domain/village/__tests__/refugees.test.ts`.
- Modify: `domain/village/inbox.ts` (osm větví → funkce z `refugees.ts`), `people.ts`
  (`foodNeedPerDay` – uprchlík v lese jí doma; `laborPerDay` 0), `domain/vassalage/guests.ts`
  (`guestFoodNeedPerDay`, `guestLaborToday` – `Guest.bornDay`: dítě jí podle věku, nepracuje),
  `simulate.ts` (`refugeFoodDay` před jídlem dne – pevné místo v pořadí kroků), kronika
  (`village-view-chronicle.ts` texty – návrh Clauda: „Lidé odešli do hradiště {jméno}.“, „Lidé se
  ukryli v lese.“, „Uprchlíci z vsi {jméno} přišli do hradiště.“, „Lidé se vrátili domů.“, „Posel
  {jméno} padl.“).

**Interfaces (`refugees.ts`, mutují stav, idempotentní):**

- `applyRefugeDepart(state, day, body)` – lidé `away: { kind: 'refuge', hostVillageId?, refId }`,
  zásoby − `carriedKg` (po druzích jako `raidLoot`), stádo − `herd` (napřed dospělí), `state.refuge`.
- `applyRefugeHidden(state, day, body)` – `refuge.hidden = { foodKg, herd }`.
- `applyRefugeCaught(state, day, body)` – padlí `death` (`cause: 'war'`, bez pohřbu), odvedení
  `removePeople`, zbylí z vzdané skupiny zůstávají pryč, dokud nedojdou (`nechat` = jdou dál).
- `applyRefugeArrive(host, day, body)` – hosté `kind: 'refuge'`, `untilDay = WAR.alarm.openUntilDay`,
  `bornDay`; `refugeStays` + `RefugeStay`.
- `leaveRefuge(host, refId): { foodKg: number; herd: Record<HerdSpecies, number> }` – odebere hosty
  a pobyt; vrátí zbylé zásoby (nejvýš `stay.foodKg`) a stádo.
- `applyRefugeBack(state, day, body)` – `away` pryč, zásoby + `foodKg` + `refuge.hidden`, stádo
  `addCattle`, `refuge` pryč.
- `applyMessengerOut/Back/Caught`.
- `refugeFoodDay(state, day)` – les: z `refuge.hidden.foodKg` do zásob tolik, kolik lidé v lese sní;
  hradiště: z každého `RefugeStay.foodKg` do zásob tolik, kolik jeho hosté sní.

- [ ] **Krok 1:** testy: (a) odchod „se vším“ – bilance obilí, stádo, lidé pryč; druhý odchod týchž
      lidí nic; (b) les – lidé jedí, `hidden` ubývá, pak zásoby vsi; (c) hradiště – hosté jedí napřed
      ze `stay`, pak ze zásob hostitele; dítě jí méně a nepracuje, dospělý pracuje na opevnění;
      (d) `leaveRefuge` + `applyRefugeBack` – bilance host + domov = konstanta; (e) dostižení – padlí
      zemřou, odvedení zmizí z vsi; (f) posel pryč nepracuje a nejí, po `messenger-back` doma;
      (g) po kouscích dopočtu (1 / 3 / 10 dní) = vcelku; (h) ves bez nových částí – zlaté testy
      (`smith-golden.test.ts`, `craft-skill-golden.test.ts`, `guests.test.ts`) beze změny.
- [ ] **Krok 2:** implementace; `npm run test` – změnit se nesmí nic mimo nové testy.
- [ ] **Krok 3:** docs (village-core.md – Nepřítomní a hosté: uprchlíci a posel; war.md – Varování:
      ves na útěku), commit `feat(game): ves na útěku – odchod, les, hradiště a návrat ve stavu vsi`.

### Úloha 8: Evakuace v tažení – skupina, dostižení, příchod, prázdná ves (≈ 150 kroků) – po Ú6, Ú7

**Files:**

- Create: `packages/game/src/domain/war/evacuation.ts`, `domain/war/__tests__/evacuation.test.ts`.
- Modify: `campaign.ts` (`applyBody` – `alarm-flee`; `dailyStep` – jídlo skupin; `campaignBattle`
  a `raidResultOf` / `raidLoot` – odečíst `alarmTaken`; pořadí v taktu), `alarm.ts`, `view.ts`
  (zatím nic – Ú14).

**Interfaces:**

- `departFlight(s, villageId, mode, tick, ctx, out): boolean` – `refugeOptions` (Ú4) musí volbu
  pustit; složení `flightLoad(villageAt(v, s.day) bez alarmTaken, s.day, mode)`; cíl: hradiště
  (`target` = střed útočiště hostitele, trasa `worldRoute`) nebo les (`nearestForest` na mapě vsi);
  `refuge-depart` domů na týž den.
- `moveFlights(s, tick, ctx, out)` – `stepMover` tempem skupiny; les → `status: 'hidden'`,
  `refuge-hidden` domů na týž den (ves drží bariéra); hradiště → `arrived`, `refuge-arrive`
  hostiteli na následující den, upozornění `refuge-arrived` majiteli vsi.
- `catchFlights(s, tick, ctx, out)` – Otevřené 8; `refuge-caught` domů na následující den, kořist
  `CampaignLoot` (`foodKg`, `herd`, `people`), upozornění `refuge-caught`.
- `flightFoodDay(s)` – v denním kroku: skupina na cestě sní `foodNeedPerDay` svých lidí (podle
  `bornDay`) ze `foodKg`; bez jídla jde dál (hlad se nepočítá – cesta je krátká; Rizika).
- `alarmTaken(s, villageId, day): { people: Set<number>; foodKg: number; herd: Record<HerdSpecies, number> }`
  – co tažení z vsi v den `day` odvedlo (posel, skupina) – `campaignBattle` lidi vynechá
  z `defenderRoster` / `planDefense`, `raidLoot` zásoby a stádo odečte.

- [ ] **Krok 1:** testy `evacuation.test.ts` (mapy jako v Ú5, hradiště C s palisádou): (a) uhlíř
      varuje, hráč zvolí „Do hradiště – se vším“ → skupina odejde, dojde do C, `refuge-arrive`
      se zásobami po jídle na cestě; vojsko v A najde prázdnou ves – kořist = zásoby mimo nesené,
      nesehnaný dobytek nic, domy stojí; (b) „jen lidé“ → rychlejší, stádo a zásoby zůstanou a útočník
      je vezme; (c) „Ukrýt v lese“ → `refuge-hidden`, v boji nikdo z nich, kořist bez jejich zásob;
      (d) vojsko zkříží cestu skupině (do 30 m), přesila → vzdá se, kořist, `refuge-caught`;
      bez přesily jde dál; poslední muž rodu uteče do lesa; (e) **den odchodu** – boj v týž den:
      odešlí v `BattleState` nejsou, kořist nebere jejich zásoby (Review Focus 2); (f) volba, kterou
      `refugeOptions` blokuje (`too-late`), se zahodí; (g) po 1 / 7 / 40 / 400 taktech a přes JSON
      = vcelku; (h) bilance obilí: ves + skupina + kořist + hostitel = konstanta.
- [ ] **Krok 2:** implementace; `npm run test` – `raid-campaign.test.ts`, `raid-apply.test.ts`,
      `stance.test.ts` beze změny (ves bez `alarm` se chová jako dřív); jinak zastavit a hlásit.
- [ ] **Krok 3:** docs (war.md – Varování: evakuace, dostižení, prázdná ves; war.md – Postoje vsi
      a včasný útěk: odkaz), commit `feat(game): evakuace do hradiště nebo lesa jako skupina po stezkách`.

### Úloha 9: Pobyt v hradišti – útočiště a obrana (≈ 90 kroků) – po Ú8

**Files:**

- Modify: `domain/war/campaign.ts` (`guardGuestsOf` ř. ≈ 753 – i hosté druhu `refuge` od
  `WAR.army.minAge`; `reportGuards` – padlí a zajatí uprchlíci domů jako hosté z ochrany),
  `domain/war/stance.ts` (`StanceInput.refugeLoad?: { people: number; herd: number }` – ženy a děti
  uprchlíků a jejich dobytek zabírají útočiště po domácích; kdo se nevejde, stojí u brány jako
  skupina domů), `defenders.ts` (beze změny tvaru – `GuardGuest` se použije).
- Create: `domain/war/__tests__/refuge-defense.test.ts`.

- [ ] **Krok 1:** testy: (a) hradiště s 20 domácími a 15 uprchlíky (6 mužů) → 6 mužů na hradbě
      (`wallPosts`), obsazenost roste; (b) malé útočiště – domácí uvnitř, uprchlíci napřed, dobytek
      venku (stáda první); (c) padlý muž uprchlíků → událost do jeho domovské vsi (smrt bez pohřbu),
      zajatý → vězeň jako host z ochrany; (d) hradiště bez uprchlíků – `battle.test.ts`,
      `stance.test.ts` bit po bitu.
- [ ] **Krok 2:** implementace; docs (war.md – Varování: pobyt a obrana; Obránci na hradbě – odkaz),
      commit `feat(game): muži uprchlíků brání hradiště`.

### Úloha 10: Návrat – use-case, správce a úloha světa (≈ 120 kroků) – po Ú3, Ú7

**Files:**

- Create: `packages/game/src/application/refuge-return.ts`,
  `application/__tests__/refuge-return.test.ts`, port `RefugeRepository` (`awayVillages(): Promise<{
villageId; refId; hostVillageId: string | null }[]>`) a adaptér
  `packages/db/src/adapters/refuge-repository.ts` (nad `village.state ? 'refuge'` – ověř sloupec
  v `schema/`), `db/adapters/__tests__/refuge-repository.db.test.ts`.
- Modify: `application/rights.ts` (`ACTION_RIGHTS.returnFromRefuge` = `war`),
  `application/succession-credits.ts` (`WorldTaskDeps.refugees?`, `runWorldTasks` →
  `returnStewardRefugees` po `reconcileShipments`), `apps/worker/src/main.ts`.

**Interfaces:**

- `returnFromRefuge(deps, { playerId, villageId, today }): Promise<{ ok: true; arrivesDay: number } |
{ ok: false; reason: string }>` – `requireRight(…, 'returnFromRefuge')`; ves má `refuge`; skupina
  dorazila (`hidden` nebo `refugeStays` u hostitele); **žádné tažení z `activeAlarming(ves)` nemá
  skupinu s aktivním mužem na políčku vsi** (jinak „Vojsko je ještě na mapě.“). Les: `refuge-back`
  domů na dnešek (`hidden` se vrátí). Hradiště: pod zámkem držitele hostitele `updateVillage`
  s `leaveRefuge` → `refuge-back` domů (`ref` = `refuge-back:<refId>`, den = dnes + odhad cesty);
  pád mezi uložením a zápisem → opakování dopíše jen událost (vzor `sendCorvee`).
- `returnStewardRefugees(deps, { today })` – `awayVillages()`; ves se správcem nebo NPC rodu, jejíž
  poslední `raidDay` + 1 ≤ dnes a vojsko na mapě nestojí → `returnFromRefuge` za správce (kronika
  „Správce vrátil lidi domů.“ – návrh Clauda).
- Důvody (návrh Clauda): „Lidé ještě nedorazili.“, „Vojsko je ještě na mapě.“, „Ves nikoho
  neodvedla.“

- [ ] **Krok 1:** testy use-casu (in-memory porty): (a) vojsko na mapě → odmítnuto, po odtažení
      vrátí zbylé zásoby a celé stádo, bilance host + domov = konstanta (Review Focus 5); (b) les →
      týž den; (c) opakované volání = jedna událost; (d) cizí hráč a správce cizí vsi bez práva
      `war` odmítnut; (e) správce vrátí ves den po posledním dni nájezdu, hráčovu ves bez správce ne.
- [ ] **Krok 2:** db test adaptéru; implementace; `test`, `test:db`; docs (war.md – Varování: návrat;
      worker.md – úlohy světa), commit `feat(game): návrat uprchlíků domů`.

### Úloha 11: Kdo rozhoduje – lhůta hráče, správce a NPC rody (≈ 90 kroků) – po Ú8

**Files:**

- Modify: `domain/war/alarm.ts` (`decideAlarms(s, tick, ctx, out)` – po spatření a poslech:
  `owner.npc` nebo `steward.on` (`villageAt`) → hned `stewardAlarmChoice`; hráč bez správce →
  v taktu `warnTick + WAR.alarm.playerGraceTicks`, nezvolil-li; `decided`), `messenger.ts`
  (hradiště NPC / správce posílá do domény hned, hráč po lhůtě), `apps/worker/scripts/measure-campaigns.ts`
  (scénář s varováním – Ú15 ho pustí).
- Create: `domain/war/__tests__/alarm-steward.test.ts`.

- [ ] **Krok 1:** testy: (a) NPC ves – posel a útěk do hradiště v taktu varování; (b) hráč bez
      správce a bez volby – po 344 taktech jako správce; volba v taktu 100 má přednost a správce už
      nerozhoduje (Review Focus 6); (c) postoj `defend` → jen posel, lidé zůstanou, boj jako dnes;
      (d) vlastní opevnění s plochou → jen posel; (e) nestihnou ani jen lidé → les; bez lesa nic
      (postoj při boji); (f) hradiště správce rozešle posly do domény hned; (g) po kouscích = vcelku.
- [ ] **Krok 2:** implementace; `npm run test` – `npc-commander.test.ts` a `raid-campaign.test.ts`
      (NPC cíle) se smí změnit jen tam, kde cílová ves teď včas uteče (komentář „war.md – Varování, 9. 11. 2026“); jiný test → zastavit a hlásit.
- [ ] **Krok 3:** docs (war.md – Varování: správce a NPC; village-steward.md – odkaz), commit
      `feat(game): správce a NPC rody varují, posílají posly a evakuují`.

### Úloha 12: Pohled na varování a příkazy (≈ 110 kroků) – po Ú9, Ú10, Ú11

**Files:**

- Create: `packages/game/src/application/alarm-view.ts` (`villageAlarmView`, `commandAlarm`),
  `application/__tests__/alarm-view.test.ts`, `apps/web/lib/alarm.ts` (server – složení deps,
  `alarmViewForPlayer`, `commandAlarmForPlayer`), `apps/web/lib/alarm-view.ts` (klient – texty
  důvodů, odhad ve dnech), `apps/web/hooks/use-alarm.ts` (dotazování jako `use-campaign.ts`, 2 s
  při varování, jinak 10 s), `apps/web/lib/__tests__/alarm-view.test.ts`.
- Modify: `application/rights.ts` (`commandAlarm` = `war`), `apps/web/app/game/actions.ts`
  (`commandAlarm(input)`, `returnFromRefuge(input)` – vzor `orderBreakout` ř. ≈ 735, parse vstupu),
  texty upozornění (grep `foreign-army` v `apps/web/lib` – „Vesničan spatřil cizí vojsko u Kněžic!“, „Uprchlíci
  z Kněžic došli do Lhoty.“, „Uprchlíci z Kněžic byli dostiženi.“, „Posel z Kněžic byl chycen.“ –
  návrh Clauda; klik otevře panel dvorce).

**Interfaces:**

```ts
interface AlarmView {
  campaignId: string;
  villageId: string;
  warned: boolean;
  armyEtaDays: number | null;
  options: Record<
    'messenger' | 'forest' | 'people' | 'all',
    { blocked: string | null; etaDays?: number }
  >;
  host: { villageId: string; name: string } | null;
  messenger: { status: 'running' | 'arrived' | 'caught' } | null;
  flight: {
    mode: FlightMode;
    status: 'marching' | 'arrived' | 'hidden' | 'caught';
    etaDays: number | null;
  } | null;
  ret: { blocked: string | null } | null; // Vrátit se
  domain?: { villageId: string; name: string; warned: boolean }[]; // hradiště hráče – komu poslat
}
```

- `villageAlarmView(deps, { playerId, villageId })` – právo `war`; tažení z `activeAlarming`
  (nejnovější varování); po skončeném tažení jen `ret` ze stavu vsi (`refuge`). Texty důvodů
  (`ALARM_BLOCKED`): `no-hillfort` „Pán nemá hradiště“, `too-late` „Nestihnou to“ (popisek doplní
  odhad: „– vojsko tu bude za ≈ 2 dny, z mapy jim to potrvá ≈ 3 dny.“), `no-forest` „Na mapě není
  les.“, `no-runner` „Nikdo nemůže běžet.“, `gone` „Lidé už odešli.“, `sent` „Posel už běží.“.
- `commandAlarm(deps, { playerId, villageId, command })` – `command` = `messenger` | `flee` (`mode`)
  | `domain` (`to[]`); ověří právo a znovu `refugeOptions` nad posledním bodem; `queueCampaignIntent`
  (teď + 2 takty) jako `orderBreakout`.

- [ ] **Krok 1:** testy use-casu: (a) nevarovaná ves → `warned: false`, volby zašedlé; (b) varovaná
      bez hradiště → „Pán nemá hradiště“; (c) pozdě → „Nestihnou to“ s odhady; (d) cizí hráč → null;
      (e) příkaz → záměr v `campaign_intent` na takt teď + 2; zablokovaný → důvod, žádný záměr;
      (f) po skončeném tažení `ret` podle návratu (Ú10).
- [ ] **Krok 2:** web: server actions, hook, `lib/alarm-view.ts` + test (odhad ve dnech, texty).
- [ ] **Krok 3:** `typecheck`, `lint`, `test`; docs (web-ui.md – nová sekce „Varování a útěk
      v rozhraní“ – data a akce), commit `feat(web): pohled na varování a příkazy obránce`.

### Úloha 13: Rozhraní – ikony v panelu vsi (≈ 120 kroků) – po Ú12

**Files:**

- Create: `apps/web/components/game/hud/AlarmButtons.tsx`,
  `hud/__tests__/AlarmButtons.behavior.test.tsx`; ikony `apps/web/public/icons/war/`
  `alarm-messenger.png` (běžící muž s holí), `alarm-forest.png` (lidé mezi stromy), `alarm-people.png`
  (hradiště s postavou), `alarm-all.png` (hradiště s postavou, ovcí a vozem), `alarm-return.png`
  (dům se šipkou dovnitř) z `tools/blender/icons.py` (sekce Ikony rozhraní – nový blok), zápis do
  `public/icons/LICENSES.md` (vlastní CC0).
- Modify: `hud/ManorPanel.tsx` (řádek pod postojem vsi, jen když `AlarmView.warned` nebo `ret`),
  upozornění (klik → panel dvorce vsi).

Rozložení (0 A.D.): pět ikon v řadě – **Poslat posla**, **Ukrýt v lese**, **Do hradiště – jen
lidé**, **Do hradiště – se vším**; po útěku místo nich stav (ikona volby s přesýpacími hodinami
a odhadem dnů, nebo zaškrtnutí po příchodu) a **Vrátit se**. Název jen v `Tooltip`, důvod červeně
(`denied`); odhad času v popisku zašedlé volby „Nestihnou to“. Hradiště hráče: u ikony posla
výběr vsí domény (seznam s portréty vsí, zaškrtnutí – návrh Clauda). Po kliknutí zašedne do
odpovědi serveru, nejdéle 10 s (vzor `BreakoutButton`). Bez práva `war` zašedne s důvodem práva.

- [ ] **Krok 1:** testy chování (`@testing-library`): ikony podle `AlarmView`, důvod u kurzoru,
      odhad v popisku, klik volá akci jednou, po útěku stav a Vrátit se, bez práva zašedlé.
- [ ] **Krok 2:** ikony z Blenderu (headless skript, 64 px jako ostatní), licence.
- [ ] **Krok 3:** `typecheck`, `lint`, `test`, `format:check`; snímek panelu jen na konci (menší);
      docs (web-ui.md – Varování a útěk v rozhraní: ikony), commit
      `feat(web): ikony varování a útěku v panelu vsi`.

### Úloha 14: Scéna – průvod uprchlíků, posel a ikona na mapě tažení (≈ 140 kroků) – po Ú8, Ú12

**Files:**

- Modify: `packages/game/src/domain/war/scene-view.ts` (`WarSceneView.refugeMarch?:
WarSceneRefugeMarch[]`, `messengers?: WarSceneMessenger[]` – obránce svou skupinu a posla na mapě
  své vsi vždy, útočník jen v dohledu vlastních mužů – `inSight`; poloha ze `AlarmMover.leg` a
  `walkedM` jako skupiny pochodu), `domain/war/view.ts` (`CampaignView.foreign.flights` – skupiny
  uprchlíků a posli v dohledu: poloha, lidí, kusů), `apps/web/lib/war-scene-view.ts`,
  `apps/web/lib/scene/army.ts` / `army-renderer.ts` (průvod = postavy vsi s nákladem jako dnešní útěk
  do lesa `WarSceneFlight` + stádo `caravan-cattle.ts`; posel = jedna postava během), `hud/CampaignMap.tsx`
  (ikona skupiny uprchlíků a posla – stejné ikony jako Ú13 zmenšené), `useWarScene` – scéna se
  zapne i bez boje, je-li `refugeMarch` nebo posel na mapě.
- Tests: `domain/war/__tests__/scene-view.test.ts` (mlha – útočník průvod mimo dohled nevidí,
  obránce vždy), `apps/web/lib/__tests__/war-scene-view.test.ts`.

- [ ] **Krok 1:** testy pohledu (mlha, poloha po taktech, lidé a stádo).
- [ ] **Krok 2:** scéna: průvod od vsi k okraji mapy (hradiště) nebo k lesu, stádo za lidmi, vozy
      jako karavana; kreslí se jen při pohybu (`needsRender` v `animate()` v taktu `WATER_FPS`);
      Babylon jen z konkrétních modulů; 8 vertex bufferů.
- [ ] **Krok 3:** `typecheck`, `lint`, `test`; snímek scény na konci (menší); docs (scene.md – Vojsko,
      boj a mlha války: průvod a posel; web-ui.md – mapa tažení), commit
      `feat(web): průvod uprchlíků a posel ve scéně a na mapě tažení`.

### Úloha 15: e2e, měření a dokumentace (≈ 120 kroků) – po všech

**Files:**

- Modify: `apps/web/e2e/multiplayer-war.spec.ts` (nový test), `apps/worker/scripts/measure-campaigns.ts`,
  `docs/code/worker.md` (Výkon – Tažení), `docs/code/war.md` (sekce Varování – úplná),
  `docs/design/war.md` (sekce Varování – „schváleno 9. 11. 2026 – implementováno“, odkazy na kód;
  Později: boj v poli při dostižení, kořist zásob a stád uprchlíků v dobytém hradišti, posel na koni
  k pánovi přes víc hradišť).

- [ ] **Krok 1:** e2e „ves B varovaná utíká do hradiště pána“: rod B je vazalem A2 (třetí hráč – pán
      s hradištěm = ves s hotovou palisádou, zapsaná přímo do DB jako v testu hradeb); tažení A
      zapsané do kontrolního bodu 1,5 km od vsi B, worker vedle `next start`. Ověř: B dostane
      upozornění, v panelu dvorce pět ikon, „Do hradiště – se vším“ → řádek `campaign_intent`
      `alarm-flee` od B; po dopočtu `refuge-arrive` v schránce hradiště, hosté `refuge` ve stavu,
      ve vsi B lidé `away`; ikona Vrátit se zašedlá „Vojsko je ještě na mapě.“; po přenesení vojska
      pryč klik Vrátit se → lidé doma. Snímek `utek-do-hradiste.png` v `test-results`.
- [ ] **Krok 2:** stávající testy `multiplayer-war.spec.ts` – ves B bez správce s výchozím postojem:
      boj se otevře dřív než lhůta hráče, útěk do lesa při boji jako dřív (beze změny); kdyby se
      změnily, zastavit a hlásit.
- [ ] **Krok 3:** `npx tsx apps/worker/scripts/measure-campaigns.ts` – scénář 20 tažení × 60 mužů
      s varováním (vsi s oky, posli, 5 evakuací); cíl: pochod ≤ 6 % jádra (dnes 4,4 %), jinak
      mezipaměť očí po dnech a dohled jen pro skupiny do 300 m od oka (čtverec vzdálenosti napřed).
      Zapsat do worker.md.
- [ ] **Krok 4:** `npm run test:e2e -- multiplayer-war`, `typecheck`, `lint`, `test`, `format:check`;
      commit `test(e2e): útěk do hradiště a návrat` a `docs: varování, poslové a útěk do hradiště`.

---

## Zlaté otisky a testy

- **Nesmí se změnit nikde:** otisky krajiny a vrstvy překážek (všechny verze), otisk kostry světa,
  `march.test.ts` (otisk trasy – vytažení pohybu do `movement.ts` bit po bitu), `campaign.test.ts`
  (kousky taktů), `battle.test.ts`, `raid-apply.test.ts`, `smith-golden.test.ts`,
  `craft-skill-golden.test.ts`, `guests.test.ts`, `steward*.test.ts`, testy dopočtu po kouscích.
  Úloha, která některý z nich pohne, se zastaví a hlásí.
- **Smí se změnit (s komentářem „war.md – Varování, 9. 11. 2026“, jen v uvedené úloze):**
  - Ú2: `raid-watch.test.ts`, `raid-day.test.ts`, `stance.test.ts` (posel z prošlé vsi a dny nájezdu
    až od varování), `campaign-race.db.test.ts` (očekávané dny nájezdu).
  - Ú11: `npc-commander.test.ts`, `raid-campaign.test.ts` – jen kde NPC cíl teď včas uteče.
- **Migrace DB:** žádná (poslední zůstává 0040).

## Rizika

- **Výkon taktu:** oči vsi × skupiny vojska v každém taktu – mezipaměť očí po dnech, dohled jen
  od skupin (ne mužů); měří Ú15.
- **Bariéra:** varovaná ves daleko od vojska je držená celou dobu varování – stojí-li tažení
  (čeká na data), stojí i ona; stejné jako dnes u vsí u tažení.
- **Dvě tažení najednou** (Otevřené 12) – odchod v týž den ze dvou tažení: druhá událost lidi
  nenajde, ale druhé tažení si skupinu vede také → duplicitní postavy v pohledu, kořist z prázdné
  skupiny 0. Řešit, až se objeví.
- **Jídlo na cestě:** skupina bez jídla jde dál bez hladu (krátká cesta); dlouhá cesta „jen lidé“
  přes víc políček zkreslí – hladovění uprchlíků později.
- **Stáda u hradiště** nejedí seno hostitele – v zimě zvýhodnění; zpřesnit, až bude krmení stád
  hostů.
- **Data hradiště** (opevnění) se čtou ze stavu, který drží bariéra (Ú3) – bez ní by výsledek
  závisel na tom, kdo počítal dřív.

## Otázky na Martina

Žádné blokující – volby v „Otevřené – návrh Clauda“ (1–12) jsou v mezích schváleného specu;
Martin je uvidí v hlášení a může je změnit před spuštěním vlny B.
