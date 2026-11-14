# Výpravy – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráč vybere kohokoli ze vsi od 12 let (Shift přidá další), pravým tlačítkem ho pošle jako skupinu kamkoli na mapě i na sousední mapy, skupin může být víc naráz. Jezdcům osedlá koně vesničan, venku jezdec sesedne a koně vede. Skupina bez rozkazu 3 dny jde domů, kdo je ve skupině, ve vsi nepracuje.

**Architecture:** Výjezd vojvody (`domain/war/journey*.ts`) se stane výpravou s víc skupinami: jedna běžící výprava (řádek `journey`) na dvojici hráč × domovská ves a v jejím stavu skupiny hráče `parties` a hloučky `groups` (tvar `CampaignGroup` + `party`). Rozkazy nesou id lidí – krok výpravy podle nich skupiny dělí a spojuje, nové lidi ze vsi přidá. Ves se o lidech a koních pryč dozví stávající cestou (`away: journey`, schránka vsi). Web nic nepočítá: výběr lidí, pravé tlačítko a tlačítka Osedlat / Sesednout / Domů posílají záměr, scéna ukazuje pohled z kontrolního bodu.

**Tech Stack:** TypeScript 6, Vitest, Drizzle + PostgreSQL, Next.js 16 / React 19, Babylon.js 9, Playwright.

**Spec:** `docs/design/expeditions.md` (schváleno – Martin 14. 11. 2026: „Takhle je to ok“). Navazuje na `docs/design/lord-control.md` (pohyb, dohled, znalost rodu, soused, nebezpečí, prohraný boj platí dál) a `docs/design/horses.md` (Výcvik koně a jezdec, Ve scéně). Mapa kódu: `docs/code/journey.md`.

## Global Constraints

- **Determinismus a JSON:** stav výpravy je JSON, krok čte jen stav, záměry a svět; výsledek nezávisí na kouscích taktů (test „vcelku = po kouscích přes JSON“ v každé úloze jádra). V `domain/war/**` jen det-math (vzdálenost `length2` z `domain/landscape/det-math.ts`), žádné `Math.hypot`, `**`, `Date.now()`, `Math.random()`.
- **Čísla jen v `rules-war.ts` (`JOURNEY`)** s odkazem na sekci návrhu, ze specifikace doslova:
  - věk pro výpravu **od 12 let** (`JOURNEY.minAge: 12` – expeditions.md, Kdo smí jít; Martin 14. 11. 2026) – platí i pro vojvodu, `WAR.army.minAge` se pro výpravu nepoužije;
  - čekání bez pohybu **3 herní dny** (`JOURNEY.waitDays`, beze změny);
  - tempo ≈ 3,5 m/s, jezdci × 1,5, sníh × 0,75 (`marchSpeed`, beze změny);
  - nasednutí **10 s** po příchodu koně (`JOURNEY.mountWaitS: 10` – horses.md, Ve scéně: „10 s stojí, jezdec nasedne“); změna čísla = i řádek v tabulce Čísla v `expeditions.md`.
- **Hexagon:** doména a use-casy bez infrastruktury; adaptéry bez herní logiky (převod starého stavu volá aplikace, ne adaptér).
- **Ves:** nové části stavu volitelné; `away` a `horseId` už existují – žádný nový převod ve `VILLAGE_MIGRATIONS` není potřeba. Funkce vstupní stav nemění.
- **Server jediná autorita:** web posílá jen id lidí a rozkaz; způsobilost, dosažitelnost, válku a koně ověří use-case a krok. Klient ukazuje důvod u kurzoru z odpovědi serveru nebo z pohledu.
- **Hra funguje po každé úloze:** staré API (`launchJourney`, `commandJourney`, `journeyCandidates`, `JourneyRecruit.mounted`) žije jako tenký adaptér, dokud ho nenahradí web (Úloha 9); smaže ho Úloha 12.
- **UI jako 0 A.D.:** ikony a čísla, slova jen v `Tooltip` a v důvodu u kurzoru. Texty důvodů (doslova): „Tam nedojde.“, „Ves je napadena.“, „Tam je válka.“, „Tu mapu rod nezná.“, „Kůň je doma.“, „Je raněný.“ / „Je raněná.“, „Je na tažení.“, „Na sousední mapu“; návrh plánu: „Je pryč.“, „Od 12 let.“.
- **Scéna:** Babylon z konkrétních modulů, kreslí se jen při změně (`needsRender` jen během pohybu), žádný nový vertex buffer (postavy a koně přes instance `ArmyRenderer` – WebGPU limit 8).
- **Před commitem:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`.
  - Úloha 2 navíc `npm run test:slow` (pravidla vsi – zlaté otisky se nesmějí změnit; změní-li se, zastav a nahlas).
  - Úloha 4 a 6 `npm run test:db`; úlohy 7–12 `npm run test:e2e` (výpravy jsou v projektu `worker` – `npm run test:e2e:worker`).
  - Změna v `docs/code` = `npm run check:docs`.
- **Migrace:** subagent ji jen vygeneruje a ověří v `test:db`; do vývojové DB `bohemia` ji pouští hlavní sezení po sloučení (se zálohou).
- **Souběh s jinými větvemi:** `village/core/inbox.ts` (union událostí), `livestock/horse-breeding.ts` a `docs/code/*.md` mění i jiné větve – při slučování ručně. Číslo migrace = další volné (dnes `0051`).
- Komentáře a docs česky s „–“; rozhodnutí plánu se v docs značí „návrh Clauda“.

## Rozhodnutí plánu (návrh Clauda)

1. **Úložiště – výprava za domovskou ves.** Jeden běžící řádek `journey` na dvojici hráč × domovská ves, v jeho stavu libovolně skupin. Unikátní index `journey_player_home_active_idx (player_id, home_village_id) WHERE status = 'active'` nahradí `journey_player_active_idx`. Proč:
   - `home` zůstane jedna na stav – bariéra vsí (`homes`), `homeDay` a `away-ends` beze změny tvaru;
   - dělení a spojení skupin se děje v jednom stavu, jedním krokem pod jedním zámkem – žádná transakce přes víc výjezdů;
   - `groups[].cell` čte bariéra i `onCell` (`@>`) pro libovolný počet hloučků už dnes.
     Lidé ze dvou vsí hráče jsou vždy ve dvou výpravách; výběr přes dvě vsi nejde (klik na člověka jiné vsi výběr nahradí).
2. **Skupina a hlouček.** `JourneyParty` je skupina hráče (výběr, rozkaz, lhůta, vůdce), `JourneyGroup` hlouček – lidé na jednom místě s jednou polohou. Skupina z lidí na různých místech má víc hloučků; všechny jdou ke stejnému cíli tempem nejpomalejšího ze skupiny a splynou, když oba stojí na stejném cíli. Lhůta 3 dnů běží od chvíle, kdy stojí všechny hloučky skupiny (a nesedlá se).
3. **Rozkazy na lidi.** Záměr nese id lidí (`people`) a data nových lidí ze vsi (`recruits`), ne id skupiny. Rozkaz části skupiny ji rozdělí (zbytek stojí a čeká). Rozkaz lidem z víc skupin je spojí do jedné. Osedlat a Sesednout skupiny nedělí ani nespojují. Starý záměr (`JourneyOrder` bez `people`) platí pro všechny členy.
4. **Převod běžícího výjezdu:**
   - migrace přidá `journey.home_village_id` (doplní z bodu `state->'home'->>'villageId'`) a vymění index;
   - stav převede při čtení `upgradeJourney` – jedna skupina 0 s hloučkem 0, `arrivedTick` a fáze `returning` přejdou do skupiny, `leaderName` dostane vojvoda jako `name`, jezdec `mounted` dostane `horse: 'ridden'`;
   - převod je idempotentní a do DB se nezapisuje zvlášť (uloží ho další bod).
5. **Lidé pryč ve vsi** – mechanismus beze změny: každý člen (i žena a dítě od 12) má `away: { kind: 'journey', refId }`, `isAway` = nepracuje, `foodNeedPerDay` = jí doma. Doplní se `isAway` tam, kde ho výběr práce nezná (výrostci 12–13 let pasou – `youngsterCount`). Návrat po hloučcích: `away-ends` s `personIds`.
6. **Koně venku:** kůň zůstává v `pen.horses` (jí jako dřív) a je venku, dokud má jezdec `away.horseId` (nová událost výpravy `journey-horse`). Chov 1. 5. (hřebec) a porážka 1. 11. ho přeskočí. Návrat koně:
   - `away-ends` – jezdec doma;
   - `journey-horse` s `horseId: null` – sesednutí doma, jezdec zůstává ve skupině;
   - jezdec padne – osoba ze vsi zmizí a kůň je zase volný v ohradě.
7. **Osedlání v jádru** (`JourneyParty.horseWork`):
   - **Doma** = hlouček na domovské mapě. Vesničan = nejbližší dospělý doma (poloha jeho obydlí k vůdci skupiny, shoda nižší id). Nikdo doma: jezdec dojde pro koně sám (obdoba „odvede ho jezdec sám“).
   - **Trvání osedlání** = cesta vesničana k ohradě a s koňmi k jezdcům tempem jednoho pěšího výpravy (`marchSpeed`) + `mountWaitS`. Hloučky skupiny po tu dobu stojí, rozkazy se zapíší a platí po ní.
   - **Sesednout doma:** vesničan dojde k jezdcům (+ `mountWaitS`), pak je kůň v ohradě. Nikdo doma: kůň zůstane u jezdce (vedený) až do návratu.
   - **Mimo ves** se nasedá i sesedá hned; jezdec, jehož kůň je v ohradě, venku nenasedne.
8. **Síla a boj:** do meče muž rodu `lineManStrength` (na koni se svým koněm), vesničan od 16 let `villagerStrength`, ženy a děti 0 (war.md – Síla: bojují muži). Proti šelmám `fight = arms.combat ?? 0` – kdo bránit neumí, má vyšší riziko.
9. **Šelmy po hloučcích:** los jen hloučku v hustém lese s nejvýš `predatorGroupMax` živými. Proud `predators:<den>` u hloučku 0 (staré výjezdy a testy beze změny), jinak `predators:<den>:<id hloučku>`.
10. **Upozornění** „Bořivoj se vrátil.“ / „Dobrava se vrátila.“ při návratu každého hloučku – jméno vůdce hloučku (`partyLeader`). Vůdce bez jména: „Výprava se vrátila.“. Skupina, která ztratila vojvodu, se vrací sama, rozkazy hráče neplatí a upozornění nemá (lord-control.md – Prohraný boj, jako dnes).
11. **Výběr a odeslání:**
    - pravé tlačítko pošle z výběru jen způsobilé, ostatní zůstanou; důvod u kurzoru jen, když nemůže nikdo;
    - rozkaz jen lidem, kteří už ve výpravě jsou, jde jako dnes bez zámku vsi (jen záměr);
    - s novými lidmi jde přes zámek hráče a úpravu vsi.

## Review Focus

1. **Starý kontrolní bod a staré záměry** (`groups[0]` bez `party`, `arrivedTick` ve stavu, fáze `returning`, záměr `{ kind: 'home' }`) se dopočtou stejně jako před úlohou – test v Úloze 1.
2. **Souběh přidání lidí s koncem výpravy:** worker výpravu ukončí (poslední hlouček doma), zatímco hráč přidává lidi. Nikdo nesmí zůstat `away: journey` bez běžící výpravy – testy v Úlohách 4 a 5.
3. **Rozdělení a spojení:** rozkaz části skupiny nechá zbytek stát s novou lhůtou; dva hloučky jedné skupiny splynou jen na stejném cíli; „Domů“ části skupiny pošle domů jen ty vybrané; dopočet po kouscích = vcelku – testy v Úloze 1.
4. **Kůň:**
   - osedlání, když doma není žádný dospělý;
   - kůň během výpravy uhyne nebo zmizí z ohrady;
   - jezdec padne – kůň je zase volný;
   - chov a porážka 1. 11. koně venku nevyberou.
     Testy v Úlohách 2 a 3.
5. **Ženy a děti:**
   - dítě 12–13 let ve skupině nepase, žena nepracuje, oba jedí doma – test v Úloze 2;
   - dítě pod 12 a raněný vybraný s ostatními zůstane doma, ostatní jdou – test v Úloze 5.

---

### Task 1: Jádro – víc skupin ve výpravě, rozkazy na lidi a převod starého stavu (opus – determinismus)

**Files:**

- Modify: `packages/game/src/domain/war/journey-types.ts`, `journey.ts` (krok po skupinách a hloučcích), `index.ts` (exporty)
- Create: `packages/game/src/domain/war/journey-upgrade.ts` (`upgradeJourney`, `commandOf`), `journey-parties.ts` (`partyLeader`, `applyCommand`, dělení a spojení)
- Modify (jen aby hra dál fungovala): `packages/game/src/application/launch-journey.ts` (vstup `newJourney`), `journey-view.ts` (pohled ze skupiny vojvody), `step-journeys.ts` (`homeFromWar` – fáze skupiny, `playerSeesChange` – hloučky podle id), `journey-war.ts` (tvar záměru `commandOf`), `packages/db/src/schema/journey.ts` (jen typ `body` = `JourneyIntentBody`)
- Test: `domain/war/__tests__/journey.test.ts` (stávající projdou), nové `__tests__/journey-parties.test.ts`, `__tests__/journey-upgrade.test.ts`
- Docs: `docs/code/journey.md` – Stav a krok (skupiny, hloučky, rozkazy na lidi, převod)

**Interfaces:**

- Consumes: `away-ends` s `personIds` (Úloha 2).
- Produces:

```ts
interface JourneyMember {
  /* dosavadní pole */ group: number;
  name?: string;
  female?: true;
  bornDay?: number;
}
interface JourneyGroup extends CampaignGroup {
  party: number;
}
interface JourneyParty {
  id: number;
  phase: 'out' | 'returning';
  arrivedTick: number | null;
  crossing?: true;
  leaderless?: true;
}
interface JourneyState {
  /* … */ phase: 'out' | 'done';
  groups: JourneyGroup[];
  parties: JourneyParty[];
  nextId: number;
  leaderName?: string;
}
type JourneyOrder =
  { kind: 'go'; pos: Pos; cell?: GridCell } | { kind: 'cross'; cell: GridCell } | { kind: 'home' };
type JourneyRecruit = Pick<
  JourneyMember,
  'ref' | 'lord' | 'strength' | 'fight' | 'name' | 'female' | 'bornDay'
> & { mounted?: true };
type JourneyCommand =
  | { kind: 'order'; order: JourneyOrder; people?: number[]; recruits?: JourneyRecruit[] }
  | { kind: 'recall'; cells: GridCell[] };
type JourneyIntentBody = JourneyCommand | JourneyOrder; // JourneyIntent.body
interface NewJourney {
  id;
  seed;
  playerId;
  houseId;
  home: CampaignVillage;
  startMs: number;
  recruits: JourneyRecruit[];
  order?: JourneyOrder;
}
function upgradeJourney(state: JourneyState | LegacyJourneyState): JourneyState;
function commandOf(body: JourneyIntentBody): JourneyCommand;
function partyLeader(members: readonly JourneyMember[]): JourneyMember | undefined;
function applyCommand(
  s: JourneyState,
  command: JourneyCommand,
  ctx: TickContext,
  out: TickOut,
): void;
```

- Sémantika (krok, v pořadí taktu jako dnes):
  - **`people`** – osoby příkazu, které jsou ve výpravě aktivní a jejich skupina nemá `leaderless`. Chybí = všichni takoví. `recruits` (id, která ve výpravě nejsou) se přidají jako noví členové v novém hloučku na `home.pos`. Stojí-li cílová skupina celá doma na `home.pos`, přidají se do jejího hloučku.
  - **`partyLeader`** – vojvoda, jinak nejstarší muž, jinak nejstarší člen (`bornDay`, chybí = nejmladší), shoda nižší `ref.personId`.
  - **Ověření před změnou:** `cross` na políčko nesousedící s hloučkem vůdce výběru se zahodí celý (beze změny stavu, i bez přidání nových lidí).
  - **Dělení:** skupina, z níž je vybraná jen část, si nechá zbytek. Smíšený hlouček se rozdělí (nový hlouček se stejnou polohou). Hloučky zbytku zastaví (`goal = null`, `route = []`, `leg = null`, `arrived = true`), skupina zbytku dostane `phase 'out'` a `arrivedTick = tick`.
  - **Spojení:** vybraní tvoří jednu skupinu. Je-li výběr právě celá jedna skupina, zůstane její id, jinak nové id z `nextId`. Hloučky na stejném místě (políčko, poloha, oba stojí) splynou.
  - **Rozkaz dostanou všechny hloučky skupiny:**
    - `go` – cíl `{ cell: order.cell ?? cell vůdce, pos }`;
    - `cross` – cíl `{ cell, pos: edgeCrossing(cell vůdce, cell, pos vůdce) }`, `crossing = true`;
    - `home` – `sendGroup(g, s.home)`, `phase 'returning'`;
    - jinak `phase 'out'`; vždy `arrivedTick = null`.
  - **`recall`** (worker a válka) – skupiny s hloučkem na některém z `cells`, nebo s cílem tam, jdou domů (`phase 'returning'`). Rozkazy hráče platí jen pro skupiny bez `leaderless`; `recall` pro všechny.
  - **Pohyb:**
    - každý hlouček tempem `marchSpeed` ze všech živých členů své skupiny;
    - zastavení po přechodu okraje jen u skupiny s `crossing`, když hlouček vstoupil na `goal.cell`;
    - po pohybu splynou hloučky téže skupiny, které oba stojí a mají shodný `goal` (políčko i poloha);
    - skupina, jejíž hloučky všechny stojí, dostane `arrivedTick = tick` (jen když je null);
    - venku po `waitTicks` jde domů celá.
  - **Návrat:**
    - hlouček, který doma dojde, skončí: událost `away-ends { refId, untilDay: den + 1, personIds }` jeho živých členů, upozornění `journey-returned { journeyId, leader, female? }` s vůdcem hloučku (jen skupina bez `leaderless`);
    - jeho členové a hlouček ze stavu zmizí, skupina bez hloučků taky;
    - výprava bez skupin = `phase 'done'`.
  - **Ztráty:** `homeDay` beze změny (kdo ve vsi není, `fallen`). `afterLosses` po skupinách:
    - skupina bez živých zmizí i s hloučky (bez událostí);
    - skupina s padlým vojvodou dostane `leaderless` a jde domů.
  - **Šelmy** po hloučcích (Rozhodnutí 9). Objevování: oči = polohy všech hloučků na téže cizí mapě (`lookOnMap` s víc `eyes`). Znalost se vydá při přechodu a dojetí každého hloučku.
  - **`newJourney`** – všichni `recruits` tvoří skupinu 0 s hloučkem 0 na `home`, `nextId = 1`. S `order` ho použije jako dnes, bez něj skupina stojí (`arrivedTick = takt`). `recruit.mounted` (jen starý adaptér) = `mounted: true`.

- [ ] **Step 1: Failing testy**
  - `journey-upgrade.test.ts`:
    - starý bod (tvar dnešního `newJourney`, `phase 'returning'`, `arrivedTick 12`) → `parties [{ id 0, phase 'returning', arrivedTick 12 }]`, `groups[0].party 0`, členové `group 0`, vojvoda `name = leaderName`, `nextId 1`, `phase 'out'`;
    - `upgradeJourney(upgradeJourney(x))` je hluboce rovno `upgradeJourney(x)`;
    - `commandOf({ kind: 'home' })` → `{ kind: 'order', order: { kind: 'home' } }`.
  - `journey-parties.test.ts` (svět v paměti jako `journey.test.ts`):
    - **dvě skupiny:** rozkaz A `go` na (100, 0) a B `go` na (−100, 0) → po dojetí dva hloučky na různých místech, každá skupina vlastní `arrivedTick` a po 3 dnech jde domů sama;
    - **dělení:** skupina {1, 2, 3} na cestě, rozkaz `go` jen pro {3} → {1, 2} stojí, kde byli (`arrived`, `goal null`) a jejich lhůta začíná tímto taktem; {3} jde;
    - **spojení:** {1} a {2} v různých hloučcích, společný `go` → jedna skupina, dva hloučky; po dojetí na týž cíl jeden hlouček se členy {1, 2}; tempo jako nejpomalejší (pěší);
    - **nový člověk:** `order` s `recruits [{ ref 7 }]` a `people [1, 7]`, 1 je venku → 7 přibude doma v novém hloučku téže skupiny a jde k cíli;
    - **Domů části:** skupina {1, 2} venku, `home` pro {2} → `away-ends` jen s `personIds [2]` po dojetí, 1 dál stojí;
    - **vůdce:** {žena 30 let, muž 20 let} → vůdce muž; bez mužů nejstarší;
    - **upozornění:** hlouček s vojvodou → `journey-returned { leader 'Bořivoj' }`; po smrti vojvody (`homeDay`) skupina `leaderless`, jde domů, rozkaz hráče ji nezmění, upozornění chybí;
    - **šelmy:** hlouček se 3 lidmi v lese nelosuje, oddělený hlouček 1 člověka ano (seed z existujícího testu šelem); los hloučku 0 je stejný jako dřív;
    - **`recall`** s políčkem hloučku → skupina `returning`, jiná skupina beze změny;
    - **determinismus:** dvě skupiny, dělení, spojení a návrat – vcelku = po 7 taktech přes `JSON.parse(JSON.stringify())`.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/war/__tests__/journey-parties.test.ts src/domain/war/__tests__/journey-upgrade.test.ts` → FAIL (moduly neexistují).
- [ ] **Step 3: Implementace** typů, `journey-upgrade.ts`, `journey-parties.ts` a kroku v `journey.ts`.
  - `stepJourney` volá `upgradeJourney` na začátku a záměry čte přes `commandOf`.
  - Aplikace:
    - `launchJourney` předá `recruits` (vojvoda a družina, `mounted` podle koně – dnešní chování) a `order`;
    - `journeyViewFor` čte skupinu s vojvodou (jinak první), `waitDaysLeft` a fázi z ní (`returning` → `'returning'`);
    - `homeFromWar` a `recallJourneysAtWar` zapisují `{ kind: 'recall', cells: [cell] }`.
- [ ] **Step 4:** Nové testy projdou a `npx vitest run src/domain/war src/application` projde celé. `journey.test.ts` a `journey-predators.test.ts` beze změny očekávání; v `step-journeys.test.ts` a `war.test.ts` se mění jen tvar zapsaného záměru (`recall` místo `{ kind: 'home' }`).
- [ ] **Step 5:** Docs (`journey.md` – Stav a krok, Rozkazy), kontroly z Global Constraints, commit `feat(game): výprava s víc skupinami – rozkazy na lidi, dělení a spojení skupin`.

### Task 2: Ves – lidé a koně pryč, návrat po skupinách (Sonnet)

**Files:**

- Modify: `packages/game/src/domain/village/core/inbox.ts` (`away-ends.personIds?`, nová událost `journey-horse`), `domain/vassalage/guests.ts` (`endAway`)
- Create: `packages/game/src/domain/village/livestock/horses-out.ts` (`horsesOut`, `applyJourneyHorse`)
- Modify: `livestock/horse-breeding.ts` (`horseBirths`, `retireHorses`), `livestock/herding.ts` (`youngsterCount`)
- Audit (`isAway` u výběru práce, týká se lidí od 12 let):
  - `fields/harvest-hands.ts`, `core/morning-water.ts`, `wildlife/wildlife-damage.ts`, `wildlife/field-patrol.ts`;
  - `trade/people-trade.ts` (pryč nikoho nevyměnit), `crafts/iron.ts`, `crafts/cart-iron.ts`, `people/lodge-life.ts`, `people/church-life.ts`;
  - doplnit jen tam, kde se vybírá, kdo dnes něco dělá.
- Test: `livestock/__tests__/horses-out.test.ts`, `people/__tests__/expedition-away.test.ts`, `vassalage/__tests__/guests.test.ts` (rozšířit)
- Docs: `docs/code/village-people.md` – Nepřítomnost na výjezdu (každý od 12 let), `docs/code/village-livestock.md` – nová sekce „Koně venku s výpravou“

**Interfaces:**

- Produces:
  - `{ kind: 'away-ends'; refId: string; untilDay: number; personIds?: number[] }` – s `personIds` jen tito lidé.
  - `{ kind: 'journey-horse'; journeyId: string; personId: number; horseId: number | null }`.
  - `endAway(state, refId, untilDay, personIds?: readonly number[]): void`.
  - `horsesOut(state: Pick<VillageState, 'people'>, day: number): ReadonlySet<number>` – `away.horseId` lidí s `away.kind === 'journey'`, kteří jsou dnes pryč.
  - `applyJourneyHorse(state, day, body): ChronicleEvent[]` – u osoby s `away { kind: 'journey', refId: journeyId }` nastaví `away.horseId` (jen když je kůň s `riderId === personId` v ohradě koní), s `null` ho smaže. Jinak nic (idempotentní).
- Chov a porážka:
  - `horseBirths` bere za hřebce jen koně, kteří nejsou v `horsesOut`;
  - `retireHorses` koně z `horsesOut` vůbec nebere;
  - krmení, péče a místa v ohradě beze změny.

- [ ] **Step 1: Failing testy**
  - `guests.test.ts`: `endAway(s, 'j1', 10, [2])` → `untilDay 10` jen u osoby 2, osoba 3 se stejným `refId` beze změny; bez `personIds` jako dosud.
  - `horses-out.test.ts`:
    - `journey-horse` s koněm 5 → `away.horseId 5` a `horsesOut` = {5}; s `null` → prázdné; cizí `journeyId` nic nezmění;
    - 1. 11.: kůň 25 let venku nejde na maso, stejný v ohradě ano;
    - 1. 5.: jediný hřebec venku → žádné hříbě, v ohradě → hříbě;
    - jezdec odstraněn (`applyJourneyCasualty` smrt) → `horsesOut` prázdné, kůň v ohradě dál.
  - `expedition-away.test.ts`:
    - žena 30 let a dítě 12 let s `away { kind: 'journey' }` → `laborPerDay` 0;
    - `foodNeedPerDay` jako doma;
    - `youngsterCount` dítě nepočítá;
    - `lineCandidates` a `villagerCandidates` člena výpravy nevrátí.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/village/livestock/__tests__/horses-out.test.ts src/domain/village/people/__tests__/expedition-away.test.ts src/domain/vassalage` → FAIL.
- [ ] **Step 3: Implementace**
  - Napoj `journey-horse` v `applyEvent`.
  - Projdi audit a u každého místa, kde se vybírá pracující, doplň `isAway(p, day)` (výsledek pro ves bez lidí pryč se nesmí změnit).
- [ ] **Step 4:** Testy projdou; `npm run test:slow` – zlaté otisky beze změny (nikdo pryč na výpravě v nich není).
- [ ] **Step 5:** Docs, kontroly, commit `feat(game): ves – lidé a koně pryč s výpravou, návrat po skupinách`.

### Task 3: Jádro – osedlat a sesednout (opus – časování a determinismus)

**Files:**

- Modify: `packages/game/src/domain/war/journey-types.ts`, `journey-parties.ts` (příkazy `saddle` a `dismount`), `journey.ts` (pohyb stojí při práci s koňmi, `homeDay` – kůň zmizel), `rules-war.ts` (`JOURNEY.mountWaitS`)
- Create: `packages/game/src/domain/war/journey-horses.ts`
- Test: `domain/war/__tests__/journey-horses.test.ts`
- Docs: `docs/code/journey.md` – nová sekce „Koně výpravy“; `docs/design/expeditions.md` – tabulka Čísla, řádek „osedlání doma“ (návrh Clauda – Rozhodnutí 7)

**Interfaces:**

- Consumes: `journey-horse` (Úloha 2), `applyCommand` a `JourneyCommand` (Úloha 1).
- Produces:

```ts
type MemberHorse = 'ridden' | 'led';
interface JourneyMember {
  /* … */ horseId?: number;
  horse?: MemberHorse;
  strengthMounted?: number;
}
type JourneyRecruit = /* … */ { horseId?: number; strengthMounted?: number };
interface HorseWork {
  kind: 'saddle' | 'unsaddle';
  groomId: number | null;
  riders: number[];
  fromTick: number;
  untilTick: number;
  pen: Pos;
}
interface JourneyParty {
  /* … */ horseWork?: HorseWork;
}
type JourneyCommand =
  /* … */
  | { kind: 'saddle'; people?: number[]; recruits?: JourneyRecruit[] }
  | { kind: 'dismount'; people?: number[] };
function riderHorse(
  village: VillageState,
  personId: number,
  horseId: number | undefined,
  day: number,
): { horse: Horse; pen: Pen } | null;
function pickGroom(
  village: VillageState,
  day: number,
  near: Pos,
  skip: ReadonlySet<number>,
): { personId: number; from: Pos } | null;
function horseWorkTicks(input: {
  kind: 'saddle' | 'unsaddle';
  groom: Pos | null;
  pen: Pos;
  riders: Pos;
  day: number;
}): number;
```

- **Jezdec** = člen s `horseId` (Úloha 5 ho vyplní z `Horse.riderId`). `riderHorse` ho najde v ohradě koní domovské vsi (jezdecký kůň, `riderId === personId`).
- **`pickGroom`** – dospělý (`ageGroup === 'adult'`), ne `isAway`, ne `isInjured`, ne ve `skip`. Nejmenší `length2` od `Dwelling.position` k `near`, shoda nižší id.
- **`horseWorkTicks`** – sekundy krát `TICKS_PER_SECOND`, zaokrouhleno nahoru; rychlost `marchSpeed({ onFoot: 1 … }, day)`:
  - `saddle` – (groom→pen + pen→riders) ÷ rychlost + `mountWaitS`;
  - bez vesničana – (riders→pen + pen→riders) ÷ rychlost + `mountWaitS`;
  - `unsaddle` – groom→riders ÷ rychlost + `mountWaitS`.
- **`saddle`:**
  - `recruits` vytvoří skupinu stojící doma (bez rozkazu); ostatní vybraní zůstanou ve svých skupinách;
  - jezdci s `horse 'led'` nasednou hned (`mounted`, `horse 'ridden'`);
  - jezdci bez koně u sebe, jejichž hlouček je na `home.cell` a kůň v ohradě (`riderHorse`), dostanou jedno `horseWork` za skupinu: `near` = poloha hloučku vůdce, `pen` = `{ x, z }` ohrady koně prvního jezdce;
  - hned jde do vsi `journey-horse { horseId }` za každého takového jezdce;
  - skupina, která už `horseWork` má, příkaz ignoruje; jezdec venku s koněm v ohradě nic.
- **V `untilTick`:**
  - `saddle` – jezdci `mounted`, `horse 'ridden'`;
  - `unsaddle` – `mounted false`, `horse` smazat, `journey-horse { horseId: null }`;
  - `horseWork` zmizí; stojí-li všechny hloučky skupiny, `arrivedTick = untilTick` (lhůta „od osedlání“).
  - Do té doby `moveGroup` hloučky skupiny přeskočí, rozkazy cíle nastaví.
- **`dismount`** jezdcům s `horse 'ridden'`:
  - na `home.cell` s vesničanem `horseWork 'unsaddle'`;
  - jinak hned `mounted false`, `horse 'led'`.
- **`homeDay`:** jezdec s `horse`, jehož kůň ve vsi už není (`riderHorse` null), ho ztratí (`mounted false`, `horse` smazat).
- **Starý stav a starý adaptér:** `upgradeJourney` doplní `horse: 'ridden'` členům s `mounted` (bez `horseId` – ves o koni neví, jako dnes). `recruit.mounted` s `horseId` = `horse 'ridden'` a `journey-horse` hned.

- [ ] **Step 1: Failing testy** (`journey-horses.test.ts`, ves v paměti s ohradou koní a obydlími):
  - **`pickGroom`:** dospělý z bližšího obydlí vyhraje; člen výpravy, raněný a dítě ne; nikdo → null.
  - **Osedlat doma:**
    - `horseWork` s `untilTick = fromTick + horseWorkTicks(…)`;
    - hlouček do `untilTick` stojí i s rozkazem `go` zapsaným hned po osedlání, pak jede tempem jezdců;
    - událost `journey-horse` v taktu příkazu.
  - **Nikdo doma:** `groomId null`, trvání z cesty jezdce.
  - **Mimo ves:**
    - jezdec s `horse 'led'` nasedne v taktu příkazu;
    - s koněm v ohradě se nic nezmění a žádná událost.
  - **Sesednout:**
    - mimo ves → `horse 'led'`, tempo pěšího;
    - doma s vesničanem → hlouček stojí do `untilTick`, pak `journey-horse { horseId: null }`;
    - doma bez nikoho → `horse 'led'`.
  - **Lhůta:** skupina osedlaná doma bez rozkazu jde po 3 dnech od `untilTick` domů a skončí `away-ends`.
  - **Kůň zmizel** ze vsi → jezdec v dalším `homeDay` nesedí.
  - **Determinismus:** sedlání přes hranici kousků – vcelku = po kouscích přes JSON.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/domain/war/__tests__/journey-horses.test.ts` → FAIL.
- [ ] **Step 3:** Implementace; `JOURNEY.mountWaitS: 10` s odkazem na horses.md – Ve scéně.
- [ ] **Step 4:** `npx vitest run src/domain/war` projde.
- [ ] **Step 5:** Docs (`journey.md`, řádek v `expeditions.md` – Čísla), kontroly, commit `feat(game): výprava – osedlat a sesednout, kůň vedený a návrat do ohrady`.

### Task 4: Úložiště – výprava za každou ves hráče (Sonnet, může běžet souběžně s 1–3)

**Files:**

- Modify: `packages/db/src/schema/journey.ts` (`homeVillageId`, nový index), `packages/db/src/adapters/journey-repository.ts`
- Create: migrace `packages/db/drizzle/0051_journey_home_village.sql` (přes `npm run db:generate`, pak ručně doplnit backfill)
- Modify: `packages/game/src/application/journeys.ts` (port), `application/__tests__/in-memory-journeys.ts`, volající `activeOf`:
  - `launch-journey.ts` → `activeIn(player, village)`;
  - `journey-view.ts` → `activeOfPlayer` (první);
  - `journey-war.ts` – všechny;
  - `restart-game.ts` – ukončí všechny.
- Test: `packages/db/src/adapters/__tests__/journey-repository.db.test.ts`, `village-holds.db.test.ts` (beze změny musí projít), `application/__tests__/restart-game.test.ts`
- Docs: `docs/code/journey.md` – Úložiště

**Interfaces:**

- Produces (port `JourneyRepository`, `activeOf` zmizí):
  - `activeIn(playerId: string, villageId: string): Promise<string | null>` – běžící výprava hráče z této vsi;
  - `activeOfPlayer(playerId: string): Promise<string[]>` – podle `created_at`, `id`;
  - `create(state, createdAt)` zapíše `home_village_id = state.home.villageId`; druhá běžící výprava téže dvojice hráč × ves vyhodí chybu databáze.
- Migrace (pořadí v SQL):
  1. `ADD COLUMN home_village_id text`;
  2. `UPDATE journey SET home_village_id = c.state->'home'->>'villageId' FROM journey_checkpoint c WHERE c.journey_id = journey.id`;
  3. řádky bez bodu dostanou `status = 'done'` a `''`;
  4. `SET NOT NULL`;
  5. `DROP INDEX journey_player_active_idx`;
  6. `CREATE UNIQUE INDEX journey_player_home_active_idx ON journey (player_id, home_village_id) WHERE status = 'active'`.
     Snímek Drizzle odpovídá koncovému stavu.

- [ ] **Step 1: Failing testy**
  - `journey-repository.db.test.ts`:
    - dvě vsi hráče → dvě běžící výpravy, `activeOfPlayer` vrátí obě v pořadí založení, `activeIn` každou;
    - druhé `create` pro tutéž ves vyhodí;
    - po `end` jde založit znovu;
    - `onCell` najde výpravu se dvěma hloučky na různých políčkách přes kterékoli z nich.
  - `restart-game.test.ts`: dvě výpravy hráče – obě skončí (`activeOfPlayer` prázdné, obě domovské vsi dostanou `away-ends`).
- [ ] **Step 2:** `npm run test:db` → FAIL (sloupec ani metody neexistují).
- [ ] **Step 3:** Implementace (adaptér, paměťové úložiště se stejnou unikátností, volající).
- [ ] **Step 4:** `npm run test:db` a `npm run test` projdou (bariéra `village-holds` beze změny – `homes` čte `state.home`).
- [ ] **Step 5:** Docs, kontroly, commit `feat(db): výprava za každou ves hráče – home_village_id a unikátní index`.

### Task 5: Use-case – rozkaz vybraným lidem a přidání lidí ze vsi (opus – souběh)

**Files:**

- Create: `packages/game/src/application/expedition.ts`, `packages/game/src/domain/war/expedition-people.ts`
- Modify: `domain/war/rules-war.ts` (`JOURNEY.minAge`), `application/launch-journey.ts` (`launchJourney` a `journeyCandidates` jen jako adaptér na `musterExpedition`), `application/index.ts`
- Test: `application/__tests__/expedition.test.ts`, `domain/war/__tests__/expedition-people.test.ts`; `launch-journey.test.ts` projde beze změny očekávání
- Docs: `docs/code/journey.md` – Vyslání → „Rozkaz vybraným lidem“

**Interfaces:**

- Consumes: `JourneyCommand`, `JourneyRecruit`, `newJourney` (Úlohy 1, 3); `activeIn`, `create`, `addIntent` (Úloha 4); `orderAim`, `houseAtWarOn`.
- Produces:

```ts
type ExpeditionPersonRefusal = 'young' | 'wounded' | 'campaign' | 'away';
function expeditionRecruit(
  state: VillageState,
  person: Person,
  day: number,
): JourneyRecruit | ExpeditionPersonRefusal;
type ExpeditionCommand =
  { kind: 'order'; order: JourneyOrder } | { kind: 'saddle' } | { kind: 'dismount' };
type ExpeditionRefusal =
  | ExpeditionPersonRefusal
  | 'no-village'
  | 'nobody'
  | 'village-attacked'
  | 'unreachable'
  | 'war-there'
  | 'horse-home';
type ExpeditionResult = { ok: true; journeyId: string } | { ok: false; reason: ExpeditionRefusal };
interface ExpeditionInput {
  playerId: string;
  villageId: string;
  people: number[];
  command: ExpeditionCommand;
  now: Date;
}
function commandParty(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
): Promise<ExpeditionResult | { ok: false; reason: 'recruits' }>;
function musterExpedition(deps: ExpeditionDeps, input: ExpeditionInput): Promise<ExpeditionResult>;
```

- `ExpeditionDeps` = `LaunchJourneyDeps` + `journeys: Pick<JourneyRepository, 'activeIn' | 'checkpoint' | 'create' | 'addIntent'>`.
- **`expeditionRecruit`:**
  - pod `JOURNEY.minAge` → `young`; `isInjured` → `wounded`; pryč na tažení → `campaign`; jinak pryč → `away`;
  - jinak rekrut: `fight = arms?.combat ?? 0`, `name`, `female`, `bornDay`, `lord` (`currentLord`);
  - `horseId` = jezdecký kůň s `riderId === p.id`;
  - síla: muž rodu `lineManStrength(p, null)`, s koněm `strengthMounted = lineManStrength(p, horse)`; vesničan od 16 `villagerStrength(false, štěstí jako muster.ts)`; ostatní 0.
- **Rozdělení `people`** (celá čísla, bez duplicit, 1–200, jinak `nobody`):
  - člen = osoba s `away { kind: 'journey', refId }` výpravy `activeIn` a aktivní v jejím bodu (`upgradeJourney`);
  - ostatní přes `expeditionRecruit`; nezpůsobilí vypadnou;
  - nezbude-li nikdo → důvod prvního odmítnutého, jinak `nobody`.
  - Člověk s `away journey`, který v bodu už aktivní není (hlouček právě doma), je `away`.
- **Ověření příkazu:**
  - `order` – `orderAim` z hloučku vůdce výběru (rekruti z `home.pos`); `go.cell` musí být políčko některého vybraného (rekruti = `home.cell`); nedojde → `unreachable`; `atWar` na cíl → `war-there`;
  - `saddle` – aspoň jeden vybraný jezdec bez koně u sebe na domovské mapě (rekrut je doma), nebo s `horse 'led'`; jinak jsou-li jezdci jen venku s koněm v ohradě → `horse-home`, jinak `nobody`;
  - `dismount` – aspoň jeden vybraný `mounted`, jinak `nobody`;
  - rekruti a cizí vojsko na vsi (`activeAgainst`) → `village-attacked`.
- **`commandParty`:** bez rekrutů jen `addIntent` (takt teď + `INTENT_LEAD_TICKS`, bez zámku). S někým, kdo není člen → `{ ok: false, reason: 'recruits' }` bez zápisu.
- **`musterExpedition`** (volající drží zámek hráče):
  1. `editVillage` – `sendAway` rekrutů s `refId` = id výpravy (existující, jinak `newId()`), rekruti se ověří znovu na čerstvém stavu;
  2. bez výpravy `create(newJourney({ recruits, order? }))`; je-li první příkaz `saddle` nebo `dismount`, založí se bez `order` a příkaz jde hned jako záměr;
  3. s výpravou `addIntent({ ...command, people, recruits })`;
  4. `addIntent` vrátí null (výprava mezitím skončila) → lidi vrátit (`release`) a jednou zopakovat od kroku 1 s novou výpravou;
  5. `create` vyhodí → lidi vrátit a chybu předat dál.
- **Adaptér `launchJourney`** = `musterExpedition` s `[vojvoda, ...družina]` a `order`. Rekruti jezdci dostanou `mounted: true` (dnešní jízda bez osedlání, do Úlohy 12).

- [ ] **Step 1: Failing testy**
  - `expedition-people.test.ts`:
    - dítě 11 let → `young`, 12 let → rekrut se silou 0;
    - raněný → `wounded`; na tažení → `campaign`; robota → `away`;
    - syn s koněm → `horseId` a `strengthMounted > strength`.
  - `expedition.test.ts` (porty v paměti):
    - **založení:** dva vesničané doma → nová výprava, oba `away journey` se stejným `refId`, bod má jednu skupinu se dvěma členy a cíl;
    - **další skupina:** druhý příkaz jiným lidem → stejná výprava, záměr s `recruits`, žádné druhé `create`;
    - **nezpůsobilí:** výběr {dítě 8 let, raněný, zdravý} → jde jen zdravý; jen {dítě 8 let} → `young` a nic se nezapíše;
    - **napadená ves:** `village-attacked` pro rekruty, `commandParty` členům projde;
    - **`commandParty` s rekrutem** → `recruits`, nic se nezapíše;
    - **Osedlat venku** s koněm v ohradě → `horse-home`;
    - **souběh:** `addIntent` vrátí null → lidé vráceni a založena nová výprava, nikdo `away` s `refId` skončené;
    - **pád `create`** → lidé zpět doma, chyba propadne;
    - člověk z hloučku, který právě došel domů → `away`.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/application/__tests__/expedition.test.ts src/domain/war/__tests__/expedition-people.test.ts` → FAIL.
- [ ] **Step 3:** Implementace; `JOURNEY.minAge: 12` s odkazem na expeditions.md – Kdo smí jít.
- [ ] **Step 4:** Testy projdou, `launch-journey.test.ts` beze změny očekávání.
- [ ] **Step 5:** Docs, kontroly, commit `feat(game): rozkaz vybraným lidem – přidání ze vsi, ověření a záměr výpravy`.

### Task 6: Pohledy, worker a válka pro víc skupin (Sonnet)

**Files:**

- Create: `packages/game/src/application/expedition-view.ts`
- Modify:
  - `application/step-journeys.ts` (`playerSeesChange`, `homeFromWar`);
  - `application/journey-war.ts` (`recallJourneysAtWar` přes `activeOfPlayer`);
  - `application/journey-view.ts` (`visitorsOn` → po skupinách; `journeyViewFor` zůstane jako adaptér pro starý web);
  - `application/index.ts`.
- Test: `application/__tests__/expedition-view.test.ts`, `step-journeys.test.ts`, `journey-view.test.ts`, testy `recallJourneysAtWar` (`war.test.ts`)
- Docs: `docs/code/journey.md` – Rozkazy a pohled, Worker

**Interfaces:**

- Consumes: stav z Úloh 1 a 3, port z Úlohy 4.
- Produces:

```ts
interface ExpeditionView {
  journeyId: string;
  villageId: string;
  tick: number;
  day: number;
  home: GridCell;
  homePos: Pos;
  parties: PartyView[];
  /** Co rod ví o cizích mapách, na kterých hloučky stojí (klíč `x,y`) – jako dnešní `seen`. */
  seen: Record<string, SeenCell>;
}
interface PartyView {
  id: number;
  phase: 'out' | 'returning';
  controllable: boolean;
  leaderId: number | null;
  waitDaysLeft: number | null;
  horseWork: HorseWork | null;
  groups: { id: number; cell: GridCell; pos: Pos; goal: CampaignPlace | null; arrived: boolean }[];
  people: {
    personId: number;
    group: number;
    lord: boolean;
    rider: boolean;
    mounted: boolean;
    horse: MemberHorse | null;
    horseId: number | null;
    wounded: boolean;
    strength: number;
    female: boolean;
    child: boolean;
  }[];
}
function expeditionViewsFor(
  deps: JourneyReadDeps,
  input: { playerId: string },
): Promise<ExpeditionView[]>;
interface ExpeditionVisitor {
  journeyId: string;
  partyId: number;
  own: boolean;
  leaderName: string | null;
  houseName: string;
  tick: number;
  groups: { id: number; pos: Pos; goal: Pos | null }[];
  people: {
    personId: number;
    lord: boolean;
    mounted: boolean;
    led: boolean;
    female: boolean;
    child: boolean;
  }[];
}
function expeditionVisitorsOn(
  deps: VisitorsDeps,
  input: { playerId: string; villageId: string },
): Promise<ExpeditionVisitor[]>;
```

- Pohled:
  - bod se čte přes `upgradeJourney` (starý stav jako jedna skupina);
  - `strength` = `mounted ? strengthMounted ?? strength : strength`;
  - `child` = `ageGroup` dítě v den bodu;
  - `waitDaysLeft` jako dnes, ale ze skupiny;
  - `seen` = znalost rodu sloučená s `seen` výpravy pro každé cizí políčko hloučku (jeden dotaz na políčko).
- Návštěvníci: hostitel vidí skupinu, když vidí aspoň jeden její hlouček (`inSight` jako dnes); vlastní vždy. Ve výsledku jen hloučky na této mapě.
- Worker:
  - `playerSeesChange` porovná hloučky podle `id` (políčko, poloha, `arrived`, cíl), skupiny (počet, fáze, `arrivedTick`, `horseWork`) a `mounted`/`horse` členů;
  - `homeFromWar` – hlouček venku na jiném políčku než v `before` (nový hlouček proti `home.cell`), dotaz `atWar` jen pro nová políčka, jeden záměr `recall` se všemi válečnými políčky, nečeká-li už `recall` na tato políčka.
- `recallJourneysAtWar` – každá výprava hráčů obou rodů. Políčka = hloučky, cíle a `cross` v záměrech po bodu na mapách druhého rodu → jeden `recall`.

- [ ] **Step 1: Failing testy**
  - `expedition-view.test.ts`:
    - dvě výpravy hráče (dvě vsi) → dva pohledy;
    - skupina se dvěma hloučky → `groups` 2, `people` s `group`;
    - jezdec na koni → `strength = strengthMounted`;
    - cizí hráč → prázdno.
  - `step-journeys.test.ts`:
    - druhá skupina vjede na mapu rodu ve válce → `recall` s tím políčkem jednou, první skupina beze změny;
    - kolo bez nového políčka se na válku neptá (počet dotazů 0);
    - změna jen `horseWork` → bod se uloží.
  - `war.test.ts`: opověď pošle domů jen skupinu na mapě protivníka.
  - `journey-view.test.ts`: `expeditionVisitorsOn` – dvě skupiny na mapě hostitele, jedna mimo dohled → jen viditelná.
- [ ] **Step 2:** `cd packages/game && npx vitest run src/application` → FAIL.
- [ ] **Step 3:** Implementace.
- [ ] **Step 4:** `npm run test` a `npm run test:db` projdou.
- [ ] **Step 5:** Docs, kontroly, commit `feat(game): pohledy, worker a válka pro víc skupin výpravy`.

### Task 7: Web – akce, cesta API, pohled osob a dotazování (Sonnet)

**Files:**

- Create: `apps/web/lib/expedition-input.ts`
- Modify:
  - `lib/journey.ts` (`commandExpeditionForPlayer`, `expeditionViewsForPlayer`, `expeditionVisitorsOnVillage`);
  - `app/game/actions/journey.ts` (`commandExpedition`);
  - `app/api/journey/route.ts` (`{ views }`, `?visitors=`, `?map=` pro políčka všech vlastních hloučků a jejich sousedy);
  - `hooks/use-journey.ts` → `useExpeditions`;
  - `lib/journey-view.ts` (`expeditionReason`, `sceneJourneysOf` po hloučcích);
  - `lib/person-view.ts` (`ScenePerson.expedition`), `lib/person-activity.ts`, `lib/player-notices.ts`, `lib/dynasty-view.ts` (`VillageView.expeditionsAway`);
  - `components/game/village-game/use-lord-journey.ts` a `use-journey-scene.ts` (jen přechod na nová data – vojvoda dál funguje).
- Test: `lib/__tests__/expedition-input.test.ts`, `journey-view.test.ts`, `journey-scene.test.ts`, `person-activity.test.ts`, `player-notices.test.ts`, `person-view.test.ts`, `hooks/__tests__/use-journey.behavior.test.tsx`
- Docs: `docs/code/journey.md` – Web

**Interfaces:**

- Consumes: `commandParty`, `musterExpedition`, `expeditionViewsFor`, `expeditionVisitorsOn` (Úlohy 5–6).
- Produces:
  - `parseExpeditionInput(raw: unknown): { villageId: string; people: number[]; command: ExpeditionCommand } | null`:
    - `people` celá čísla 1–200 bez duplicit;
    - `go` smí mít `cell` s celými čísly;
    - jinak jako `parseJourneyOrder`.
  - Server action `commandExpedition(input): Promise<{ ok: true } | { error: string }>`:
    - napřed `commandParty` (bez zámku);
    - při `recruits` přes `journeyActionForPlayer` (`guardedAction`, právo `war`) `musterExpedition`;
    - odmítnutí = `expeditionReason`.
  - `expeditionReason(reason: ExpeditionRefusal | 'refused', female?: boolean): string` – texty z Global Constraints (`war-there` → „Tam je válka.“, `nobody`/`refused` → „Rozkaz nelze dát.“).
  - `ScenePerson.expedition?: { refusal?: ExpeditionPersonRefusal; rider?: true; inParty?: true; strength: number }` – počítá server ze stavu vsi (`expeditionRecruit`, `away.kind === 'journey'`).
  - `useExpeditions(running: boolean, onPartyEnded?: () => void): { views: ExpeditionView[]; latest; sample(nowMs); refresh() }`:
    - `running` = `view.expeditionsAway` nebo čerstvý rozkaz;
    - zmizí-li skupina nebo hlouček, `onPartyEnded` obnoví ves.
  - `sceneJourneysOf` – jeden `SceneJourney` na hlouček (klíč `${journeyId}:${groupId}`), nese i `partyId` (praporek a výběr celé skupiny), muži z `people` hloučku.
  - `journeyActivity(party)` – „je na cestě“, „čeká (N dny)“, „vrací se domů“ podle skupiny osoby.
  - Upozornění `journey-returned`:
    - `female` → „Dobrava se vrátila.“;
    - bez jména → „Výprava se vrátila.“.

- [ ] **Step 1: Failing testy**
  - `expedition-input.test.ts`: duplicitní, `NaN`, 201 lidí, neznámý příkaz → null; `go` s `cell` projde.
  - `journey-view.test.ts`:
    - `expeditionReason('wounded', true)` → „Je raněná.“;
    - `expeditionReason('horse-home')` → „Kůň je doma.“.
  - `journey-scene.test.ts`: dva hloučky jedné skupiny → dva `SceneJourney` se stejným `partyId`.
  - `person-view.test.ts`: dítě 11 let → `expedition.refusal 'young'`; syn s jezdeckým koněm → `rider`; člen výpravy → `inParty`; žena → `strength 0`.
  - `player-notices.test.ts`: `{ leader: '', female: undefined }` → „Výprava se vrátila.“.
  - `use-journey.behavior.test.tsx`: zmizí hlouček (druhý zůstává) → `onPartyEnded` jednou, dotazování běží dál.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/__tests__/expedition-input.test.ts lib/__tests__/journey-view.test.ts` → FAIL.
- [ ] **Step 3:** Implementace; vojvoda (panel s družinou) jede dál přes adaptér `launchJourney`.
- [ ] **Step 4:** Testy projdou; `npm run test:e2e:worker` – `journey.spec.ts` a `journey-worker.spec.ts` projdou beze změny.
- [ ] **Step 5:** Docs, kontroly, commit `feat(web): výpravy – akce, API, pohled osob a dotazování`.

### Task 8: Výběr Shiftem a pravé tlačítko pro vybrané lidi (Sonnet)

**Files:**

- Modify:
  - `apps/web/lib/scene/village-picking.ts` (`{ kind: 'people'; ids }`);
  - `lib/scene/village-selection.ts` (`nextSelection` pro lidi);
  - `lib/scene/scene-pointer.ts` (`setLordMode` → `setOrderMode`);
  - `lib/scene/journey-orders.ts` (`orderFromClick({ selected, … })`, `go.cell`, `lordClick` → `orderClick`);
  - `lib/scene/LandscapeScene.ts` a `SceneWarView` (kroužky víc lidí);
  - `components/game/VillageGame.tsx`, `ForeignJourneyScene.tsx`.
- Create: `components/game/village-game/use-expedition-orders.ts` (nahradí `use-lord-journey.ts`, ten smazat)
- Test: `lib/scene/__tests__/village-selection.test.ts`, `journey-orders.test.ts`, `components/game/village-game/__tests__/use-expedition-orders.behavior.test.tsx`
- Docs: `docs/code/web-ui.md` – tabulka ovládání (Shift + klik na lidi, pravé tlačítko s vybranými lidmi), `docs/code/journey.md` – Ovládání

**Interfaces:**

- Consumes: `commandExpedition`, `useExpeditions`, `ScenePerson.expedition` (Úloha 7).
- Produces:
  - `peopleTarget(ids: readonly number[]): VillageTarget | null` – 0 → null, 1 → `person`, víc → `people`;
  - `selectedPeopleIds(target): readonly number[]`;
  - `nextSelection(current, clicked, additive, double, partyOf?)`:
    - klik na člena skupiny venku vybere celou skupinu (`partyOf(personId)` → id lidí skupiny);
    - Shift (Ctrl) + klik přidá nebo ubere člověka, u člena skupiny celou skupinu;
    - člověk jiné domovské vsi výběr nahradí;
    - obydlí a lidé se nemíchají (přidání člověka k obydlím výběr nahradí).
  - `ScenePointer.setOrderMode(mode: OrderMode | null)` – dnešní `LordOrderMode` přejmenovaný.
  - `useExpeditionOrders({ villageId, selection, views, scene, foreign })` vrací:

```ts
{
  note: CursorNote | null;
  watching: GridCell | null;
  back(): void;
  bindForeign(f: ForeignLordScene | null): void;
  away: { name: string | null; selected: boolean; onSelect: () => void } | null; // jako dnes LordJourney.away
  command(c: ExpeditionCommand): void;
}
```

- Chování `useExpeditionOrders`:
  - režim rozkazu je zapnutý, když výběr obsahuje lidi; s vybranou stavbou nebo polem pravé tlačítko výběr ruší jako dnes;
  - pravé tlačítko → `commandExpedition({ villageId, people, command: { kind: 'order', order } })`, kde `go.cell` = mapa, kterou scéna ukazuje, a `villageId` = domovská ves vybraných (`ExpeditionView.villageId`, lidé doma = ves scény);
  - dvojklik nevyšle dvakrát (běžící rozkaz v ref jako dnes);
  - nemůže-li nikdo z vybraných (`ScenePerson.expedition.refusal` u všech), důvod u kurzoru bez dotazu na server.
- **Sledování:** scéna cizí mapy jde za hloučkem vůdce vybrané skupiny, bez výběru za skupinou vojvody (dnešní chování). `LordAwayBadge` beze změny.

- [ ] **Step 1: Failing testy**
  - `village-selection.test.ts`:
    - Shift + klik na dva lidi → `people [a, b]`, znovu na `a` → `person b`;
    - klik na člena skupiny {3, 4} → `people [3, 4]`;
    - člověk jiné vsi → nahradí;
    - člověk k obydlím → nahradí.
  - `journey-orders.test.ts`: `orderFromClick({ selected: true, cell: { x: 2, y: 3 }, … })` uprostřed mapy → `{ kind: 'go', pos, cell: { x: 2, y: 3 } }`; u okraje `cross`.
  - `use-expedition-orders.behavior.test.tsx`:
    - pravé tlačítko se dvěma vybranými → jedno volání s `people [a, b]`;
    - jen dítě 8 let → důvod „Od 12 let.“ u kurzoru a žádné volání;
    - odpověď `{ error: 'Tam nedojde.' }` → důvod u kurzoru, výběr zůstane.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/scene/__tests__/village-selection.test.ts lib/scene/__tests__/journey-orders.test.ts` → FAIL.
- [ ] **Step 3:** Implementace.
  - Kroužek pro každého vybraného: postava vsi (`VillageVillagers`) i postava výpravy (`SceneWarView.selectJourneyMen(ids)`).
  - Z `LordJourneyPanel` zmizí řada družiny (družinu nahradil výběr), zůstane Domů.
- [ ] **Step 4:** Testy projdou.
  - `npm run test:e2e:worker` – v `journey.spec.ts` uprav první test: místo družiny Shift + klik na vojvodu a syna, pravé tlačítko.
  - Třetí test (odjezd na koni branou dvorce) dočasně `test.fixme` s odkazem na Úlohu 11 – vojvoda od teď bez osedlání jde pěšky.
  - `journey-worker.spec.ts` (vojvoda vybraný sám, pravé tlačítko – stejné gesto) uprav jen tam, kde čeká koně.
- [ ] **Step 5:** Docs, kontroly, commit `feat(web): výběr lidí Shiftem a pravé tlačítko pro vybrané`.

### Task 9: Panel jednoho a víc vybraných – Osedlat, Sesednout, Domů (Sonnet, souběžně s Úlohou 10)

**Files:**

- Create:
  - `apps/web/components/game/hud/ExpeditionButtons.tsx`;
  - ikony `apps/web/public/icons/expedition/saddle.png` a `dismount.png` z `tools/blender/icons.py` (sekce Ikony rozhraní, CC0, řádek v `LICENSE.md` vedle);
  - `components/game/hud/selection/expedition.tsx` (`GroupBody`).
- Modify:
  - `hud/selection/people.tsx` (`PersonBody` – tlačítka místo `LordJourneyPanel`);
  - `hud/SelectionPanel.tsx`;
  - `lib/selection-details.ts` (`kind: 'people'`);
  - `hud/LordAwayBadge.tsx` (z pohledu výprav).
- Delete:
  - `hud/LordJourneyPanel.tsx`;
  - akce `getJourneyCandidates` a `launchJourney` (web);
  - `journeyCandidatesForPlayer`, `launchJourneyForPlayer`.
- Test: `components/game/hud/__tests__/ExpeditionButtons.behavior.test.tsx`, `lib/__tests__/selection-details.test.ts`
- Docs: `docs/code/journey.md` – Ovládání (Rozhraní)

**Interfaces:**

- Consumes: `useExpeditionOrders().command` (Úloha 8), `PartyView`, `ScenePerson.expedition`.
- Produces:
  - `expeditionButtons(people: readonly ExpeditionPersonState[]): { saddle: ButtonState; dismount: ButtonState; home: ButtonState }`, kde `ButtonState = 'hidden' | 'enabled' | { disabled: string }` (důvod do `Tooltip`):
    - Osedlat – je-li vybraný jezdec, který nesedí; `{ disabled: 'Kůň je doma.' }`, když všichni takoví jsou venku s koněm v ohradě, nebo skupina právě sedlá;
    - Sesednout – je-li vybraný někdo na koni;
    - Domů – je-li vybraný někdo ve skupině.
  - `ExpeditionPersonState = { personId; rider; mounted; horse: MemberHorse | null; inParty; atHomeMap; horseWork: boolean }` – složí se z `ScenePerson.expedition` a `PartyView`.
  - `SelectionDetails` `{ kind: 'people'; people: { id; portrait; role }[]; strength: number }`.
- Rozhraní:
  - jeden vybraný – `PersonBody` jako dnes a pod ním `ExpeditionButtons`;
  - víc vybraných – `GroupBody`: řada portrétů (klik vybere jen toho člověka – `resident-select-<id>`), meč (`house/sword.png`) se silou (součet `strength`), `ExpeditionButtons`;
  - popisky jen v `Tooltip` („Osedlat“, „Sesednout“, „Domů“).

- [ ] **Step 1: Failing testy**
  - `ExpeditionButtons.behavior.test.tsx`:
    - vojvoda doma bez koně u sebe → Osedlat povolené;
    - vojvoda na cizí mapě s koněm v ohradě → Osedlat zašedlé s „Kůň je doma.“;
    - vesničan → Osedlat i Sesednout skryté;
    - ve skupině → Domů;
    - klik → `command({ kind: 'saddle' })`.
  - `selection-details.test.ts`: `people [jezdec na koni, žena]` → `strength` = `strengthMounted` + 0.
- [ ] **Step 2:** `cd apps/web && npx vitest run components/game/hud/__tests__/ExpeditionButtons.behavior.test.tsx lib/__tests__/selection-details.test.ts` → FAIL.
- [ ] **Step 3:** Implementace a ikony.
- [ ] **Step 4:** Testy projdou.
  - `npm run test:e2e:worker` – první test `journey.spec.ts` doplň o Osedlat (vojvoda nasedne) a Domů z panelu.
  - Malý snímek panelu víc vybraných pro Martina.
- [ ] **Step 5:** Docs, kontroly, commit `feat(web): panel výpravy – víc vybraných, Osedlat, Sesednout a Domů`.

### Task 10: Scéna – postavy výprav, vedený kůň, praporek vybrané skupiny (Sonnet, souběžně s Úlohou 9)

**Files:**

- Modify:
  - `apps/web/lib/scene/journey-riders.ts` (`SceneJourney.men`, `journeyFigures`, `journeyFormation`, `pickRider`, `journeyHorseIds`);
  - `lib/scene/army-renderer.ts` (lidová postava žena a dítě jako u pochodu uprchlíků);
  - `lib/scene/journey-marker.ts` (`journeyMarks` jen pro vybranou skupinu);
  - `lib/e2e-hooks.ts` (`journeyScene`).
- Test: `lib/scene/__tests__/journey-riders.test.ts`, `journey-marker.test.ts`
- Docs: `docs/code/journey.md` – Scéna vsi

**Interfaces:**

- Consumes: `sceneJourneysOf` po hloučcích (Úloha 7), výběr lidí (Úloha 8).
- Produces:
  - `SceneJourney.men[]`:

```ts
{
  personId: number;
  lord: boolean;
  look: 'line' | 'man' | 'woman' | 'child';
  mounted: boolean;
  led: boolean;
  wounded: boolean;
}
```

- `look`: `line` = muž rodu, `man` / `woman` = vesničan a vesničanka, `child` dostane měřítko dítěte z `refugee-march.ts`.
- `journeyFigures`:
  - jezdci jako dnes (`ARMY_LOOKS.line`, `ride*`);
  - pěší jako postavy vsi (`ARMY_LOOKS.folk`, `woman.glb` pro ženy, chůze, bez oštěpu);
  - vedený kůň = `ArmyAnimal` koně bez jezdce vedle pěšího jezdce (≈ 1,2 m stranou, stejný směr a klip chůze).
- `journeyMarks(journeys, selected: ReadonlySet<string>)` – praporek jen na cíli hloučků vybrané skupiny (klíč `${journeyId}:${partyId}`), dokud jde ven nebo čeká.
- `journeyHorseIds` – koně členů s `horse` (jezdec i vedený); ohrada je nekreslí.
- Žádný nový mesh ani atribut; `needsRender` jen během pohybu.

- [ ] **Step 1: Failing testy**
  - `journey-riders.test.ts`:
    - žena pěšky → postava `woman` s `side 'folk'`;
    - dítě → `scale` dítěte;
    - jezdec s `led` → postava pěšky a jedno zvíře koně vedle ní;
    - `journeyHorseIds` zahrne vedeného koně.
  - `journey-marker.test.ts`: dvě skupiny, vybraná jedna → jeden praporek; bez výběru žádný.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/scene/__tests__/journey-riders.test.ts lib/scene/__tests__/journey-marker.test.ts` → FAIL.
- [ ] **Step 3:** Implementace.
- [ ] **Step 4:** Testy projdou.
  - `npm run test:e2e:worker` – v druhém testu `journey.spec.ts` praporek až po výběru skupiny.
  - Malý snímek skupiny žena + dítě + jezdec s vedeným koněm pro vizuální kontrolu.
- [ ] **Step 5:** Docs, kontroly, commit `feat(web): postavy výprav ve scéně, vedený kůň a praporek vybrané skupiny`.

### Task 11: Scéna – sedlání, sesednutí, připojení a návrat domů (Sonnet)

**Files:**

- Create: `apps/web/lib/scene/expedition-choreo.ts` (nahradí `journey-departure.ts` – ten smazat i s testem)
- Modify:
  - `lib/scene/villager-plan-lord.ts` (`journeyYard` → `expeditionYard`: branky ohrad koní, vchody obydlí, dvorec);
  - `lib/scene/army-renderer.ts`, `LandscapeScene.ts` (kdo je ve scénáři, toho den vsi nekreslí);
  - `lib/scene/villagers.ts` (poloha postavy vsi pro začátek scénáře);
  - `lib/e2e-hooks.ts`.
- Test: `lib/scene/__tests__/expedition-choreo.test.ts`
- Docs: `docs/code/journey.md` – Odjezd a příjezd → „Sedlání, připojení a návrat“; `docs/code/scene-village.md` – Jezdci (odkaz)

**Interfaces:**

- Consumes:
  - `PartyView.horseWork` (`groomId`, `fromTick`, `untilTick`, `pen`, `riders`) – Úlohy 3, 6;
  - `sceneJourneysOf`, `journeyFigures` (Úlohy 7, 10);
  - `leadPath`, `leadGate`, `leadPose` (`riders.ts`).
- Produces:
  - `horseWorkScript(work: HorseWork, ctx: ChoreoContext, tickMs: (tick: number) => number): ChoreoScript`:
    - **sedlání** – vesničan od své postavy (`ctx.figureAt(groomId)`, jinak vchod jeho obydlí) k brance ohrady, koně vyjdou a jdou za ním po `leadPath` k jezdcům, jezdci nasednou v `untilTick`;
    - **sesednutí** – vesničan k jezdcům, sesednou v `untilTick`, pak vede koně do ohrady (už jen podívaná);
    - **tempo** – trasa se natáhne nebo stáhne tak, aby příchod ke koním a k jezdcům padl na `untilTick` (`tickMs`).
  - `joinScripts(newPeople, ctx)` – noví lidé jdou od místa, kde je postava vsi kreslená, na své místo v hloučku tempem `CATCH_M_S` (jako dnešní `catchUp`).
  - `arrivalScript(group, ctx)` – hlouček, který zmizí u domova (`ARRIVE_M`, `HOME_REACH_M` jako dnes):
    - jezdci sesednou u dvorce a koně odvede nejbližší postava dospělého doma (jinak jezdec sám) k brance ohrady;
    - ostatní jdou ke vchodu svého obydlí a vejdou.
  - `ExpeditionLeave.observe(views)` – po hloučcích (klíč `${journeyId}:${groupId}`): nový hlouček u domova → připojení, nové `horseWork` → scénář, zmizelý hlouček u domova → příjezd. Načtení stránky uprostřed nic nepřehraje (jako dnes).
  - `journeyScene()` hlásí `phase` (`saddling` / `unsaddling` / `joining` / `riding` / `arriving`), `led`, `awayHorses`, `groom`.
- Omezený pohyb scénáře přeskočí (lidé stojí, kde je ukáže server).

- [ ] **Step 1: Failing testy** (`expedition-choreo.test.ts`, čistý čas jako dnešní `journey-departure.test.ts`):
  - **sedlání:** vesničan je u branky před `untilTick`, kůň u jezdce nejpozději v `untilTick`, jezdec sedí od `untilTick`;
  - **bez vesničana** (`groomId null`) – pro koně jde jezdec;
  - **sesednutí:** kůň po `untilTick` dojde do ohrady a ohrada ho pak kreslí;
  - **připojení:** nový člověk začne na poloze postavy vsi a dorazí na své místo bez skoku;
  - **příjezd:** žena dojde ke vchodu svého obydlí, jezdcův kůň do ohrady;
  - **načtení uprostřed sedlání** nic nepřehraje, omezený pohyb vše přeskočí.
- [ ] **Step 2:** `cd apps/web && npx vitest run lib/scene/__tests__/expedition-choreo.test.ts` → FAIL.
- [ ] **Step 3:** Implementace; `journey-departure.ts` a jeho test smazat.
- [ ] **Step 4:** Testy projdou.
  - `npm run test:e2e:worker` – třetí test `journey.spec.ts` přepiš a zruš jeho `test.fixme`: Osedlat → kůň opustí ohradu, vesničan ho přivede, vojvoda nasedne; pravé tlačítko; Domů → kůň zpět v ohradě.
  - Snímek sedlání (`JOURNEY_DEPARTURE_SHOT`) pro Martina.
- [ ] **Step 5:** Docs, kontroly, commit `feat(web): sedlání, sesednutí, připojení a návrat výpravy ve scéně`.

### Task 12: e2e výprav a úklid starého výjezdu (Sonnet)

**Files:**

- Rename: `apps/web/e2e/journey.spec.ts` → `apps/web/e2e/expeditions.spec.ts` (pomocníci `e2e/journey-helpers.ts` beze změny jména); `journey-worker.spec.ts` projde beze změny scénáře
- Delete:
  - `JourneyRecruit.mounted` a jeho větev v jádru;
  - `launchJourney`, `journeyCandidates`, `JourneyCandidate`, `JourneyRefusal` (`launch-journey.ts`) a jejich testy;
  - `commandJourney` a `journeyViewFor` (adaptéry z Úloh 6–7) a starý `JourneyView`, kde už nikdo nečte;
  - `journeyReason`.
- Modify: `docs/code/journey.md` (nadpis „Výjezd vojvody a výpravy“, odkazy na smazané funkce), `docs/code/village-people.md`, `docs/code/web-ui.md`, `CLAUDE.md` tabulka Mapa kódu (řádek `journey.md` – „výpravy“)
- Test: `e2e/expeditions.spec.ts`

**Interfaces:**

- Consumes: vše z Úloh 1–11.

- [ ] **Step 1: e2e** (`expeditions.spec.ts`, projekt `worker`):
  - **dva vesničané:**
    - Shift + klik na dva vesničany, pravé tlačítko → skupina odejde, s výběrem praporek u cíle;
    - klik na jednoho z nich na cestě vybere oba;
    - Domů → upozornění „Výprava se vrátila.“ a oba zase pracují (`away` zmizí);
  - **vojvoda a syn:**
    - Osedlat → vesničan přivede koně, oba nasednou;
    - přes okraj na sousední mapu, Sesednout → vedený kůň;
    - Domů → kůň v ohradě a upozornění „Bořivoj se vrátil.“;
  - **dvě skupiny naráz** jinam (body checkpointu z workeru) a cizí výprava u vsi – druhý test dnešního `journey.spec.ts`.
- [ ] **Step 2:** `npm run test:e2e:worker` → testy, které staví na smazaném API, padnou; po úklidu projdou.
- [ ] **Step 3:** Úklid (smazání výš), `grep -rn "launchJourney\|journeyCandidates\|LordJourneyPanel\|journey-departure" apps packages docs` → nic.
- [ ] **Step 4:** Všechny kontroly z Global Constraints včetně `npm run test:e2e` celého a `npm run check:docs`.
- [ ] **Step 5:** Commit `refactor(web): výpravy – e2e a úklid starého výjezdu`.

## Mimo plán (později)

- Upozornění „Bořivoj napaden u Kněžic!“ a prohraný boj s cizím rodem – přijdou s bojem na výpravě; vůdce skupiny (`partyLeader`) už je připravený.
- Nepřítomní ve skupině a sňatky, porody a stěhování ve vsi (`away` nečtou dnes ani u tažení) – beze změny.

## Pořadí a souběh

- **Napřed souběžně:** Úloha 2 (ves) a Úloha 4 (úložiště).
- **Jádro postupně:** 1 (po 2) → 3 → 5 (po 3 a 4) → 6 – sdílený stav výpravy a `journey-parties.ts`.
- **Web postupně:** 7 → 8, pak 9 a 10 souběžně (panel × scéna – sdílejí jen `e2e/journey.spec.ts`, druhý přidává testy až po sloučení prvního) → 11 → 12.
- **Hra po každé úloze funguje:**
  - do Úlohy 8 se vojvoda vysílá starým panelem přes adaptér;
  - od Úlohy 8 výběrem;
  - od Úlohy 9 se sedlá tlačítkem;
  - od Úlohy 11 je sedlání vidět ve scéně.
