# Výjezd vojvody – plán implementace (kroky 1–3 návrhu)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráč pošle vojvodu (samotného, nebo s družinou) po vlastní mapě i přes okraj na další mapy; vojvoda na místě 3 herní dny stojí a vrátí se sám. Co muži viděli, si rod pamatuje a hráč si známou mapu otevře z domova. Osamělým hrozí v hustém lese šelmy. Boj v poli (krok 4 návrhu) v tomto plánu není.

**Architecture:** Výjezd má vlastní stav a krok (`JourneyState`, `stepJourney`) vedle tažení – stav tažení je svázaný s válkou a cílovou vsí (`warId`, `target`) – a sdílí s ním stavební kameny: takty, `stepMover`, `marchSpeed`, `worldRoute`, `reachableGoal`, `inSight`, svět `CampaignWorld`, zámek, mapy políček, schránky vsí a smyčku workeru. Úložiště má vlastní tabulky `journey*` se stejnou sémantikou kontrolního bodu a záměrů; bariéru a přednostní vsi čte worker z tažení i z výjezdů. Web se na výjezd ptá vlastní cestou a jezdce kreslí stávající scéna vojska.

**Tech Stack:** TypeScript 6 (packages/game – hexagon, bez I/O), PostgreSQL + Drizzle (packages/db), Next.js 16 + Babylon 9 (apps/web), apps/worker, Vitest, Playwright.

**Spec:** `docs/design/lord-control.md` (schváleno Martinem 13. 11. 2026: „Jo, schváleno“). Vykonavatel čte návrh i tento plán.

## Global Constraints

- Čeština v UI, docs a komentářích, pomlčka „–“ (U+2013), nikdy „—“; identifikátory anglicky.
- Determinismus: v `packages/game` žádné `Math.random`, `Date.now`; stav výjezdu je JSON a po načtení pokračuje bit po bitu stejně (vcelku = po kouscích).
- Čísla jen v `rules*.ts` s odkazem na sekci návrhu – nový objekt `JOURNEY` v `packages/game/src/domain/war/rules-war.ts`: `waitDays: 3` (Na místě a návrat), `predatorGroupMax: 2` (Nebezpečí), `trailStepM: 20` (stopa odkrytého – tento plán). Věk mužů rodu od 16 let: použít stávající konstantu vojska, nové číslo nezavádět.
- Výjezd **neveze zásoby, nemrzne, bez hráče se nerozpadá, nezačíná válku** a ves hostitele na něj **nereaguje** – žádné `army-seen`, `raid-day`, varování ani zápis v kronice hostitele. Muži na cestě jedí dál ze zásob své vsi.
- Tažení se nemění: testy války procházejí bez úprav; `CampaignState` smí dostat jen volitelné nové části.
- Nové části stavu vsi jsou volitelné; zlatý otisk vsi se nesmí změnit (`npm run test:slow` u úloh, které sahají na simulaci vsi).
- Server je jediná autorita: každá akce ověří hráče a vlastnictví, vstup od klienta se validuje (konečná čísla, bod na mapě, políčko soused).
- UI jako 0 A.D. – ikony, slova jen v `Tooltip`, důvod u kurzoru. Texty přesně: „Tam vojvoda nedojde.“, „Vojvoda je raněný.“, „Vojvoda je na tažení.“, „Ves je napadena.“, „Tam je válka.“, „Tu mapu rod nezná.“; popisek okraje „Na sousední mapu“; upozornění „Bořivoj se vrátil.“ (jméno vojvody); činnosti „je na cestě“, „čeká (2 dny)“, „vrací se domů“.
- Scéna: Babylon z konkrétních modulů, kreslit jen při změně (`needsRender`), pick terénu jen přes `terrain-pick.ts`; grafika CC0 nebo z Blenderu se zápisem do `LICENSES.md`.
- Mapa kódu: nový soubor `docs/code/journey.md` a řádek v tabulce `CLAUDE.md`; každá úloha doplní svou sekci a projde `npm run check:docs`.
- Agent: pracovní strom `Bohemia-wt/<větev>` ze špičky `feat/landscape`, ≤ 150 kroků, žádné `git stash`, `rm -rf`, `db:migrate`; `test:db` a e2e jen na vlastní databázi a portu (`TEST_DATABASE`, `E2E_PORT`); commit česky s `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Před commitem `typecheck`, `lint`, `test`, `format:check`, `check:docs`.
- Modely: úlohy 1, 4, 6 a 11 (jádro, souběh, vliv na tažení) silnější model, ostatní Sonnet; recenze po každé úloze. Migrace do `bohemia` pouští Claude po sloučení úloh 3 a 10 (záloha předem) – agenti nemigrují.

## Review Focus

1. Člen výjezdu zemře doma v simulaci vsi (stáří, hlad) → výjezd ho vyřadí; je-li to vojvoda, zbytek se vrací sám a rozkazy hráče se zahazují (Úloha 1, test).
2. Domovská ves během výjezdu zanikne → výjezd skončí, nečeká navždy na ves (Úloha 1, test).
3. Klient pošle rozkaz mimo mapu, s `NaN`, na nesousední políčko, nebo rozkaz bez vlastního výjezdu → odmítnuto beze změny stavu (Úlohy 5 a 7, testy).
4. Worker spadne mezi uložením bodu a doručením: návrat do vsi (`away-ends`) i upozornění se doručí právě jednou; dopočet po kouscích přes JSON = vcelku (Úlohy 1 a 4, testy).
5. Druhý výjezd, když jeden běží, a člen družiny, který mezi výběrem a odjezdem přestal být doma → odmítnuto, ves beze změny (Úloha 2, test).

---

## Část 1 – Výjezd po bezpečných mapách

### Úloha 1: Stav a krok výjezdu v jádru

**Files:**

- Create: `packages/game/src/domain/war/journey-types.ts`, `packages/game/src/domain/war/journey.ts`
- Modify: `packages/game/src/domain/war/rules-war.ts` (`JOURNEY`), `campaign-types.ts` (`CampaignNoticeKind` + `'journey-returned'`), `packages/game/src/application/notices.ts`, barely exportů jako u tažení
- Test: `packages/game/src/domain/war/__tests__/journey.test.ts`

**Interfaces:**

- Consumes: `stepMover` (`movement.ts`), `marchSpeed`, `reachableGoal`, `GroupPace` (`march.ts`), `worldRoute`, `tickContext`, `gridOf`, `MissingData` (odkud je bere `campaign.ts`), `dayOfTick`, `tickOfMs` (`ticks.ts`), `cloneData`, typy `CampaignGroup`, `CampaignPlace`, `CampaignVillage`, `CampaignWorld`, `CampaignNotice`, `NewVillageEvent`.
- Produces:

```ts
export type JourneyPhase = 'out' | 'returning' | 'done';
export interface JourneyMember {
  ref: PersonRef; // osoba v domovské vsi (`away: journey`)
  lord: boolean; // vojvoda – hráčův muž
  mounted: boolean;
  strength: number; // `lineManStrength` při vyslání
  fight: number; // dovednost boje 0–100 při vyslání (šelmy – Úloha 13)
  health: number;
  wounded: boolean;
  woundedDay?: number;
  status: 'active' | 'fallen';
}
export interface JourneyState {
  kind: 'journey';
  id: string;
  seed: number;
  tick: number;
  day: number;
  throughDay?: number; // jako u tažení – čte ji bariéra vsí
  phase: JourneyPhase;
  playerId: string;
  houseId: string;
  leaderName: string;
  home: CampaignVillage;
  members: JourneyMember[];
  groups: CampaignGroup[]; // právě jedna skupina (tvar tažení – bariéra čte `groups[].cell`)
  arrivedTick: number | null; // takt posledního dojetí; null = jede
}
export type JourneyOrder =
  | { kind: 'go'; pos: Pos } // místo na mapě, na které skupina je
  | { kind: 'cross'; cell: GridCell } // sousední políčko (8 směrů) – zastaví u jeho okraje
  | { kind: 'home' };
export interface JourneyIntent {
  tick: number;
  seq: number;
  byPlayer: string;
  body: JourneyOrder;
}
export interface JourneyStep {
  state: JourneyState;
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
  waiting: { cells: GridCell[]; villageIds: string[] } | null;
}
export interface NewJourney {
  id: string;
  seed: number;
  playerId: string;
  houseId: string;
  leaderName: string;
  home: CampaignVillage;
  members: JourneyMember[];
  startMs: number;
  order: JourneyOrder;
}
export function newJourney(input: NewJourney, clock: WorldClock): JourneyState;
export function journeyFinished(state: JourneyState): boolean;
export function stepJourney(
  state: JourneyState,
  toTick: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): JourneyStep;
```

- [ ] **Step 1: Testy** (svět v paměti jako v `campaign.test.ts`):
  - `go` – skupina dojde na místo na své mapě, `groups[0].arrived === true`, `arrivedTick` je takt dojetí; cíl ve vodě se posune na nejbližší dosažitelné místo.
  - `cross` – skupina skončí na sousedním políčku u jeho okraje a stojí; `cross` na nesousední políčko stav nezmění.
  - čekání – `JOURNEY.waitDays` (3) herní dny po dojetí bez rozkazu → `phase: 'returning'` s cílem `home`; rozkaz během čekání lhůtu zruší a po dalším dojetí běží znovu; rozkaz `go` během návratu vrátí `phase: 'out'`.
  - návrat – po dojetí domů `phase: 'done'`, právě jedna událost `{ kind: 'away-ends', refId: state.id, untilDay: den }` do domovské vsi a upozornění `journey-returned` hráči s `{ journeyId, leader }`.
  - tempo – skupina jen z jezdců ujde za týž počet taktů 1,5× víc než pěší; s jedním pěším jde tempem pěšího; v zimě × 0,75.
  - bez zásob a mrazu – po 30 zimních dnech venku mají muži zdraví 100 a výjezd se sám neobrátí dřív než po čekání.
  - brána – v míru skupina projede otevřenou branou opevněné vsi (cíl uvnitř obvodu je dosažitelný).
  - bez vedlejších účinků – průjezd mapou s cizí vsí nevydá žádnou událost do její schránky ani upozornění jejímu hráči.
  - determinismus – krok vcelku = po 7 taktech s `JSON.parse(JSON.stringify(state))` mezi kousky (Review Focus 4).
  - chybějící mapa – `waiting.cells` a stav na konci posledního celého taktu.
  - Review Focus 1 – člen, který ve stavu domovské vsi chybí nebo nežije, dostane `status: 'fallen'`; je-li to vojvoda → `phase: 'returning'` a rozkazy hráče se zahodí; bez živých členů `done`.
  - Review Focus 2 – domovská ves neexistuje → `done` bez událostí (rozlišit „ves ještě nemá den“ od „ves není“; když to `CampaignWorld` neumí, doplnit volitelný dotaz).
- [ ] **Step 2:** FAIL → **Step 3:** implementace: denní krok jen kontroluje členy doma (žádné jídlo, mráz ani dezerce), po pohybu se nic neohlašuje vsím; 3 dny v taktech jako `absentTicks` v `campaign.ts`; `throughDay` jako u tažení. → **Step 4:** PASS.
- [ ] **Step 5:** `docs/code/journey.md` (sekce Stav a krok), řádek v tabulce `CLAUDE.md`; commit `feat(game): stav a krok výjezdu vojvody`.

### Úloha 2: Nepřítomnost „journey“ a vyslání (po Úloze 1)

**Files:**

- Modify: `packages/game/src/domain/village/types/types-people.ts` (`AwayKind` + `'journey'`), `domain/village/people/people.ts` (`foodNeedPerDay` – kdo je na výjezdu, jí doma), místa s výčtem druhů nepřítomnosti (grep `AwayKind`, kronika `people-away`)
- Create: `packages/game/src/application/journeys.ts` (port), `application/launch-journey.ts`, `application/__tests__/in-memory-journeys.ts` (vzor `in-memory-campaigns.ts`)
- Test: `application/__tests__/launch-journey.test.ts`, `domain/village/people/__tests__/journey-away.test.ts`

**Interfaces:**

- Consumes: Úloha 1; `currentLord` (`people/dynasty.ts`), `sendAway` (`domain/vassalage/guests.ts`), `lineManStrength` (`war/strength.ts`), `findPlayerVillage` a vzor verzovaného zápisu a vrácení (`send`, `release`) z `launch-campaign.ts`, `CampaignRepository.activeAgainst`.
- Produces:

```ts
export interface JourneyRepository {
  create(state: JourneyState, createdAt: Date): Promise<void>;
  active(): Promise<string[]>;
  activeOf(playerId: string): Promise<string | null>; // hráč má nejvýš jeden výjezd
  onCell(cell: GridCell): Promise<string[]>; // výjezdy se skupinou na políčku
  checkpoint(journeyId: string): Promise<JourneyCheckpoint | null>; // tvar jako `CampaignCheckpoint`
  intentsAfter(journeyId: string, tick: number): Promise<JourneyIntent[]>;
  saveCheckpoint(
    journeyId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: JourneyState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave>;
  clearOutbox(journeyId: string, tick: number): Promise<void>;
  addIntent(journeyId: string, intent: Omit<JourneyIntent, 'seq'>): Promise<JourneyIntent | null>;
}
export interface JourneyCandidate {
  personId: number;
  name: string;
  age: number;
  lord: boolean;
  mounted: boolean;
  strength: number;
}
export type JourneyRefusal =
  | 'no-lord'
  | 'lord-young'
  | 'lord-wounded'
  | 'lord-away'
  | 'village-attacked'
  | 'journey-active'
  | 'bad-retinue'
  | 'unreachable'
  | 'war-there';
export function journeyCandidates(
  deps,
  input: { playerId: string; villageId: string; today: number },
): Promise<{
  refusal: JourneyRefusal | null;
  lord: JourneyCandidate | null;
  men: JourneyCandidate[];
}>;
export function launchJourney(
  deps,
  input: {
    playerId: string;
    villageId: string;
    retinue: number[];
    order: JourneyOrder;
    now: Date;
  },
): Promise<{ ok: true; journeyId: string } | { ok: false; reason: JourneyRefusal }>;
```

- [ ] **Step 1: Testy:** muž s `away: journey` nepracuje a necvičí jako muž na tažení, ale `foodNeedPerDay` vrací totéž co doma; `journeyCandidates` – vojvoda a muži rodu od 16 let, kteří jsou doma a nejsou ranění (raněný, na tažení, zajatý a mladší chybí), `mounted` podle vlastního jezdeckého koně; muž na výjezdu není mezi muži způsobilými tažení a nejde zvolit velitelem (`prepareCampaign`); `launchJourney` – ves uložená s `away: { kind: 'journey', refId }` u vojvody i družiny, výjezd založený s prvním rozkazem; odmítnutí: cizí ves, `lord-young`, `lord-wounded`, `lord-away`, cizí vojsko na mapě vsi (`village-attacked`), běžící výjezd (`journey-active`), člen družiny mimo kandidáty (`bad-retinue`, Review Focus 5), první rozkaz na místo, kam nedojde (`unreachable`); selže-li založení po uložení vsi, muži jsou zpět doma.
- [ ] **Step 2–4:** FAIL → implementace (volající drží zámek hráče jako u `launchCampaign`; jen vlastní ves hráče) → PASS, `npm run test:slow` (zlatý otisk beze změny).
- [ ] **Step 5:** `docs/code/journey.md` (Vyslání), `docs/code/village-people.md` (druh nepřítomnosti); commit `feat(game): vyslání výjezdu a nepřítomnost mužů na cestě`.

### Úloha 3: Úložiště výjezdů, bariéra a přednostní vsi (po Úloze 2)

Až po sloučení větve `fix/audit-findings-2026-11-13` – ta přidává migraci a pořadí migrací musí sedět.

**Files:**

- Create: `packages/db/src/schema/journey.ts`, migrace přes `npm run db:generate`, `packages/db/src/adapters/journey-repository.ts`
- Modify: `packages/db/src/adapters/village-holds.ts` (meze i přednostní vsi čtou i body výjezdů), exporty `packages/db/src/index.ts`, `packages/server/src/deps.ts` (`GameDeps.journeys`)
- Test: `packages/db/src/adapters/__tests__/journey-repository.db.test.ts`, doplnit test `village-holds`

**Interfaces:**

- Consumes: port `JourneyRepository` (Úloha 2); vzor `campaign-repository.ts` a `schema/campaign.ts`.
- Produces: tabulky `journey` (`id`, `player_id`, `status` `active` / `done`, `created_at`; index na `status`), `journey_checkpoint` (`journey_id` PK a FK, `tick`, `state`, `outbox`, `updated_at`; částečný index `WHERE outbox IS NOT NULL`), `journey_intent` (`seq`, `journey_id`, `tick`, `by_player`, `body`, `created_at`; index `(journey_id, tick, seq)`); `createJourneyRepository(db): JourneyRepository`.

- [ ] **Step 1: Testy:** založení a kontrolní bod; uložení se zastaralým `fromTick` vrátí `stale`; záměr s taktem nejvýš bodem se nezapíše; `clearOutbox`; `activeOf`; `onCell` najde výjezd podle políčka skupiny; skončený výjezd není `active`. Bariéra: ves na políčku skupiny výjezdu (a políčko od ní) má mez podle `throughDay` výjezdu a je přednostní stejně jako u tažení; bez výjezdu ne.
- [ ] **Step 2–4:** FAIL → implementace (stejná sémantika zápisu jako tažení; `campaign-repository.ts` se nemění) → PASS (`test:db` na vlastní databázi).
- [ ] **Step 5:** `docs/code/journey.md` (Úložiště), `docs/code/worker.md` (Přednostní vsi); commit `feat(db): úložiště výjezdů a bariéra vsí u výjezdu`.

### Úloha 4: Výjezdy ve workeru (po Úloze 3)

**Files:**

- Modify: `packages/game/src/application/step-campaigns.ts` (dopočet s načítáním map a vsí zobecnit; `computeCampaign` zůstane jako obal), `apps/worker/src/campaign-loop.ts`, `apps/worker/src/main.ts`, `packages/server/src/deps.ts`
- Create: `packages/game/src/application/step-journeys.ts`
- Test: `application/__tests__/step-journeys.test.ts`, doplnit `apps/worker` test smyčky tažení

**Interfaces:**

- Consumes: `stepJourney`, `journeyFinished` (Úloha 1), `JourneyRepository` (Úloha 2), `CampaignLock`, `CampaignCells`, doručení schránky bodu z `step-campaigns.ts`.
- Produces:

```ts
export interface StepJourneysDeps {
  journeys: JourneyRepository;
  campaignLock: CampaignLock;
  cells: CampaignCells;
  villages: Pick<VillageRepository, 'find' | 'stampsOfVillages' | 'inbox'>;
  notices: Pick<NoticeRepository, 'post'>;
  world: WorldClock;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku? */
  atWar(playerId: string, cell: GridCell): Promise<boolean>;
  memory?: CampaignMemory;
}
/** `JourneyResult` má tvar `CampaignResult` (id a výsledek kola). */
export function stepJourneys(
  deps: StepJourneysDeps,
  input: { nowMs: number },
): Promise<JourneyResult[]>;
```

- [ ] **Step 1: Testy:** výjezd dojede a vrátí se přes několik kol; pád mezi uložením bodu a doručením → `away-ends` i upozornění dorazí právě jednou (Review Focus 4); stojí-li skupina na mapě rodu, se kterým začala válka, kolo přidá záměr `home` (jednou – při `returning` už ne); chyba jednoho výjezdu nezastaví ostatní; stávající testy `step-campaigns` beze změny.
- [ ] **Step 2–4:** FAIL → implementace (cyklus jako `stepOne`: bod → doručit schránku → záměry → dopočet → uložit → doručit; smyčka workeru volá po `stepCampaigns` i `stepJourneys`) → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Worker), `docs/code/worker.md`; commit `feat(worker): výjezdy ve smyčce tažení`.

### Úloha 5: Rozkazy a pohled (po Úloze 4)

**Files:**

- Create: `packages/game/src/application/journey-view.ts`
- Test: `packages/game/src/application/__tests__/journey-view.test.ts`

**Interfaces:**

- Consumes: Úlohy 1–2; `INTENT_LEAD_TICKS`, `reachableGoal`, `sightGrid` a oči obránce z `application/war-scene.ts`, veřejné údaje rodu (`PublicHouse`), dotaz `atWar` z Úlohy 4. Pole `seen` přidá do pohledu Úloha 6.
- Produces:

```ts
export interface JourneyView {
  journeyId: string;
  tick: number;
  day: number;
  phase: JourneyPhase;
  cell: GridCell;
  home: GridCell;
  men: { personId: number; lord: boolean; mounted: boolean; wounded: boolean }[];
  group: { pos: Pos; goal: CampaignPlace | null; arrived: boolean };
  waitDaysLeft: number | null; // 3, 2, 1 při čekání
  controllable: boolean; // vojvoda žije
}
export function journeyViewFor(
  deps,
  input: { playerId: string; sinceTick?: number },
): Promise<JourneyView | null>;
export function commandJourney(
  deps,
  input: { playerId: string; command: JourneyOrder; nowMs: number },
): Promise<
  | { queued: true; tick: number }
  | { queued: false; reason: 'refused' | 'unreachable' | 'war-there' }
>;
export interface JourneyVisitor {
  journeyId: string;
  own: boolean;
  leader: string;
  house: string;
  tick: number;
  pos: Pos;
  goal: Pos | null;
  men: { lord: boolean; mounted: boolean }[];
}
export function visitorsOn(
  deps,
  input: { playerId: string; villageId: string },
): Promise<JourneyVisitor[]>;
```

- [ ] **Step 1: Testy:** hráč bez výjezdu → `null`; pohled cizího hráče na můj výjezd → `null`; `commandJourney` zařadí záměr na takt teď + `INTENT_LEAD_TICKS`; odmítne (`refused`, Review Focus 3): bez výjezdu, po smrti vojvody, `go` mimo mapu nebo s nekonečným číslem, `cross` na nesousední políčko; `cross` na políčko se vsí rodu ve válce → `war-there`; `go` na místo, kam skupina nedojde vůbec → `unreachable`; `visitorsOn` – vlastní výjezd na mapě vsi vždy, cizí jen v dohledu lidí a domů vsi (150 m, les 50 m), se jménem vojvody a rodu; cizí ves hráče → prázdno.
- [ ] **Step 2–4:** FAIL → implementace → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Rozkazy a pohled); commit `feat(game): rozkazy a pohled na výjezd`.

### Úloha 6: Objevování za jízdy (po Úloze 5)

**Files:**

- Create: `packages/game/src/domain/war/seen.ts`
- Modify: `journey-types.ts` (`JourneyState.seen?: Record<string, SeenCell>` – klíč `x,y` políčka), `journey.ts` (po pohybu každý takt), `application/journey-view.ts` (`JourneyView.seen: SeenCell | null` – mapa, na které skupina je)
- Test: `packages/game/src/domain/war/__tests__/seen.test.ts`, doplnit `journey.test.ts`

**Interfaces:**

- Consumes: `inSight` (`sight.ts`), `MarchGrid`, `VillageState`.
- Produces:

```ts
/** Co rod o mapě ví: stopa míst, odkud se muži dívali, a naposled viděné stavby. */
export interface SeenCell {
  villageId?: string;
  trail: [number, number][];
  parts: SeenPart[];
}
export interface SeenPart {
  key: string;
  pos: Pos;
  day: number;
  data: SeenData;
}
export function sightingsOf(
  village: VillageState,
  day: number,
): { key: string; pos: Pos; eyesAt: Pos[]; data: SeenData }[];
export function lookAround(
  prev: SeenCell | undefined,
  input: {
    village: VillageState | null;
    eyes: readonly Pos[];
    grid: MarchGrid | null;
    day: number;
  },
): SeenCell;
```

Rozhodnutí plánu: `sightingsOf` vrací **stojící stavby a staveniště s polohou** – obydlí včetně dvorce (`dwellings`), staveniště (`constructions`), ohrady (`pens`), posvátné stavby (`sacredBuildings`), kostel a stavební huť (kde je stav vsi nese – `docs/code/village-masonry.md`) a opevnění (`fortifications`). Ne pole, sady, hřbitovy, lomy, stohy, jámy, cesty, lidé, zvířata a zásoby. `SeenData` nese jen to, co čte scéna (`SceneVillage` v `apps/web/lib/village-view.ts`): typ, poloha, natočení, rozměr nebo varianta, stav stavby – nikdy obyvatele, domácnosti ani zásoby. Opevnění se odkryje celé, jakmile muži dohlédnou na kterýkoli bod jeho obvodu (jako dnes útočník vidí celé opevnění cíle). Stopa je mřížka po `JOURNEY.trailStepM` (20 m) – mlhu z ní odkryje prohlížeč stejným dohledem jako dnes.

- [ ] **Step 1: Testy:** dům do 150 m od muže přibude, dům za lesem dál než 50 m ne; dům, na který muži znovu vidí, má dnešní stav; dům, který mezitím zmizel a jeho místo je v dohledu, zmizí; dům mimo dohled zůstane, jak byl („stará zpráva“); opevnění celé prvním dohledem; stopa přibývá po 20 m a neopakuje body; v serializovaném `SeenCell` nejsou klíče `people`, `storesKg` ani id domácností; mapa bez vsi nese jen stopu; `stepJourney` po průjezdu kolem vsi má `seen` jejího políčka a pohled ho vrací.
- [ ] **Step 2–4:** FAIL → implementace → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Objevování); commit `feat(game): výjezd objevuje stavby a opevnění`.

### Úloha 7: Web – akce, cesta API a dotazování (po Úloze 6)

**Files:**

- Create: `apps/web/lib/journey.ts` (composition root), `apps/web/lib/journey-input.ts`, `apps/web/lib/journey-view.ts` (typy pro scénu z jádra, texty důvodů), `apps/web/app/api/journey/route.ts`, `apps/web/app/game/actions/journey.ts`, `apps/web/hooks/use-journey.ts`
- Modify: `apps/web/lib/player-notices.ts` (`journey-returned`), `apps/web/lib/person-activity.ts`
- Test: `apps/web/lib/__tests__/journey-input.test.ts`, `journey-view.test.ts`, doplnit testy upozornění a činností

**Interfaces:**

- Consumes: `journeyCandidates`, `launchJourney`, `journeyViewFor`, `commandJourney`, `visitorsOn`; vzory `lib/campaign.ts`, `lib/campaign-input.ts`, `hooks/use-campaign.ts`, `app/api/campaign/[id]/route.ts`, `lib/foreign-map.ts`.
- Produces: `GET /api/journey?since=<takt>` → `{ view: JourneyView | null }`; `?map=x,y` → `{ map: ForeignMap }` (jen políčko skupiny a jeho sousedé, jinak 404); `?visitors=<villageId>` → `{ visitors: JourneyVisitor[] }`; server actions `getJourneyCandidates(villageId)`, `launchJourney({ villageId, retinue, order })`, `commandJourney(order)` přes `guardedAction`; `useJourney()` – dotaz 2× za sekundu jen s běžícím výjezdem, polohy mezi stavy interpolované; `journeyReason(reason): string`.

- [ ] **Step 1: Testy:** `parseJourneyOrder` přijme `go` s konečnými čísly, `cross` s celými čísly, `home`; odmítne `NaN`, `Infinity`, řetězce, neznámý druh a přebytečná pole (Review Focus 3); `journeyReason` vrací přesně texty z Global Constraints; upozornění `journey-returned` dá „Bořivoj se vrátil.“; činnosti „je na cestě“, „čeká (2 dny)“, „vrací se domů“.
- [ ] **Step 2–4:** FAIL → implementace → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Web), `docs/code/web-ui.md` (odkaz); commit `feat(web): akce a dotazování výjezdu`.

### Úloha 8: Ovládání vojvody na vlastní mapě (po Úloze 7)

**Files:**

- Create: `apps/web/components/game/hud/LordJourneyPanel.tsx`, `apps/web/components/game/hud/LordAwayBadge.tsx`, `apps/web/lib/scene/journey-orders.ts` (čistá logika rozkazu z kliknutí), `apps/web/lib/scene/journey-marker.ts` (praporek cíle, přesýpací hodiny), ikony do `apps/web/public/icons/` se zápisem do `LICENSES.md`
- Modify: `apps/web/lib/scene/scene-pointer.ts`, `scene-selection.ts`, `scene-war.ts` / `army.ts` (jezdci výjezdu a návštěvníci), panel vybrané osoby, horní lišta, hooky ve `components/game/village-game/`
- Test: `apps/web/lib/scene/__tests__/journey-orders.test.ts`, e2e `apps/web/e2e/journey.spec.ts`

**Interfaces:**

- Consumes: Úloha 7.
- Produces: `orderFromClick(input: { lordSelected: boolean; point: Pos | null; mapSizeM: number; cell: GridCell }): JourneyOrder | null` – okrajový pás 20 m dává `cross` na souseda v tom směru (rohy úhlopříčně), jinak `go`; bez vybraného vojvody `null` (pravé tlačítko ruší výběr jako dnes).

- [ ] **Step 1: Testy:** `orderFromClick` pro všech 8 směrů okraje, střed mapy, klik mimo terén a bez vybraného vojvody. E2e: výběr vojvody ukáže řadu portrétů mužů rodu s podkovou u jezdců a meč se silou skupiny; klik muže přidá a ubere z družiny; pravé tlačítko na zem → vojvoda je pryč (`away`), kůň dojde z ohrady ke kůlu, jezdci nasednou a vyjedou branou dvorce ([koně](../../design/horses.md) – Ve scéně; návrat opačně), na zemi praporek; cíl ve vodě ukáže posunutý cíl; ikona Domů → po návratu upozornění „… se vrátil.“ a vojvoda je zpět ve svém dni; druhý hráč, jehož výjezd stojí u vsi prvního, je ve scéně prvního vidět a klik ukáže jméno a rod; důvod u kurzoru „Tam vojvoda nedojde.“.
- [ ] **Step 2–4:** FAIL → implementace (s vybraným vojvodou výběr ruší Esc nebo klik jinam; u okraje kurzor šipka a popisek „Na sousední mapu“) → PASS, e2e na vlastním portu a databázi.
- [ ] **Step 5:** `docs/code/journey.md` (Ovládání), `docs/code/web-ui.md` (tabulka ovládání); commit `feat(web): ovládání vojvody ve scéně vsi`.

### Úloha 9: Cizí mapa za vojvodou (po Úloze 8)

**Files:**

- Create: `apps/web/components/game/ForeignJourneyScene.tsx`, `apps/web/lib/journey-scene-view.ts`
- Modify: přepínání scény ve `VillageGame` (jako `SceneWatch` u tažení), `apps/web/lib/scene/fog-of-war.ts` (odkrytí ze stopy, je-li třeba), `LordAwayBadge.tsx` (klik přepne scénu na mapu vojvody)
- Test: `apps/web/lib/__tests__/journey-scene-view.test.ts`, e2e s workerem `apps/web/e2e/journey-worker.spec.ts`

**Interfaces:**

- Consumes: `JourneyView`, `SeenCell`, `?map=`; vzor `ForeignWarScene.tsx`, `lib/war-scene-view.ts` (`watchCellOf`, `followCellOf`, `foreignVillageOf`).
- Produces: `seenVillageOf(seen: SeenCell | null): SceneVillage | null`; `journeyCellOf(view, home): GridCell | null` (mapa, na kterou se scéna přepne; `null` = vlastní mapa).

- [ ] **Step 1: Testy:** `seenVillageOf` složí obydlí, staveniště, ohrady a opevnění a nic dalšího (`fields` prázdné); `journeyCellOf` – vlastní mapa → `null`, cizí → její políčko. E2e s workerem: vojvoda přejede na sousední mapu se vsí → scéna `foreign-scene` s novým `data-cell`, závoj mlhy odkrytý kolem jezdců, objevené stavby odpovídají dohledu; pravé tlačítko dává rozkazy i tam; při čekání přesýpací hodiny s počtem dní; po 3 dnech nebo po Domů se scéna vrátí na ves a přijde upozornění.
- [ ] **Step 2–4:** FAIL → implementace (scéna jde za vojvodou z mapy na mapu; ⌂ vrátí pohled na ves, výjezd běží dál) → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Scéna), odkazy v `docs/design/war.md` a `docs/design/lord.md`; commit `feat(web): scéna cizí mapy za vojvodou`. **Pak Martinova vizuální kontrola** – jezdci, praporek, hodiny, mlha.

## Část 2 – Znalost rodu

### Úloha 10: Úložiště znalosti a zápis z výjezdu (po Úloze 9)

**Files:**

- Create: `packages/game/src/application/knowledge.ts` (port), `packages/db/src/schema/knowledge.ts`, migrace, `packages/db/src/adapters/knowledge-repository.ts`
- Modify: `domain/war/seen.ts` (`mergeKnowledge`), `journey-types.ts` / `journey.ts` (krok vydává znalost), `campaign-types.ts` (`CampaignOutbox.knowledge?`), `application/step-journeys.ts` (doručení), `packages/server/src/deps.ts`
- Test: `seen.test.ts`, `journey.test.ts`, `step-journeys.test.ts`, `packages/db/src/adapters/__tests__/knowledge-repository.db.test.ts`

**Interfaces:**

- Produces: tabulka `house_knowledge` (`house_id`, `grid_x`, `grid_y`, `state` jsonb, `updated_at`; PK všech tří); `mergeKnowledge(old: SeenCell | null, fresh: SeenCell): SeenCell` (stopa sjednocená, část novějšího dne přepíše starší, část chybějící ve `fresh` zůstane); `JourneyStep.knowledge?: { cell: GridCell; seen: SeenCell }[]`; `KnowledgeRepository { of(houseId, cell): Promise<SeenCell | null>; cellsOf(houseId): Promise<GridCell[]>; merge(houseId, cell, seen): Promise<void> }`.

- [ ] **Step 1: Testy:** krok vydá znalost mapy při přechodu okrajem, při dojetí a na konci výjezdu; sloučení téhož dvakrát nic nezmění (doručení po pádu je bezpečné); novější den přepíše starší; adaptér ukládá a čte po políčkách, cizí rod nic nevidí.
- [ ] **Step 2–4:** FAIL → implementace (znalost jde schránkou bodu jako události vsí) → PASS (`test:db` na vlastní databázi).
- [ ] **Step 5:** `docs/code/journey.md` (Znalost rodu); commit `feat: znalost rodu – co muži viděli, se ukládá`.

### Úloha 11: Znalost při dalším výjezdu a při tažení (po Úloze 10)

**Files:**

- Modify: `application/journey-view.ts`, `domain/war/campaign-types.ts` (`CampaignState.trail?`), `domain/war/campaign.ts` (stopa na cizích mapách, znalost na konci tažení), `application/step-campaigns.ts` (doručení), `application/campaign-view.ts`, `application/war-scene.ts`
- Test: doplnit `journey-view.test.ts`, `campaign.test.ts`, `campaign-view.test.ts`, `war-scene.test.ts`

**Interfaces:**

- Consumes: `KnowledgeRepository`, `mergeKnowledge`, `sightingsOf`.
- Produces: `JourneyView.seen` = znalost rodu sloučená s čerstvým `seen` výjezdu; tažení na konci vydá znalost (stopa a objevená obydlí cílové vsi); pohled útočníka na mapě cíle nese i stavby, které rod zná, a stopu k odkrytí mlhy; `commandCampaign` s cílem `building` přijme i dům známý ze znalosti rodu.

- [ ] **Step 1: Testy:** druhý výjezd na známou mapu má od prvního taktu stopu i stavby z prvního; tažení na mapu, kterou rod zná, vidí známé domy dřív, než je kdo z vojska spatří, a rozkaz k takovému domu projde; po konci tažení má rod v paměti jeho objevená obydlí; dům viděný kdysi, který už nestojí, zůstane v pohledu, dokud na jeho místo někdo nedohlédne; výsledky nájezdu ve stávajících testech beze změny.
- [ ] **Step 2–4:** FAIL → implementace (stopa tažení je jen záznam – boj ani pohyb nemění; opevnění cíle vidí útočník jako dnes) → PASS, `npm run test:slow`.
- [ ] **Step 5:** `docs/code/journey.md`, `docs/code/war.md` (Živé vedení a pohled); commit `feat(game): tažení zná, co rod viděl, a znalost doplňuje`.

### Úloha 12: Známá mapa z domova (po Úloze 11)

**Files:**

- Create: `packages/game/src/application/known-map.ts`, `apps/web/components/game/KnownMapScene.tsx`
- Modify: `apps/web/app/api/journey/route.ts` (`?known=x,y`), `apps/web/components/game/hud/HousePanel.tsx` (oko u rodu), `ArmyPanel.tsx` (oko u cíle), `apps/web/lib/journey-view.ts`
- Test: `application/__tests__/known-map.test.ts`, e2e doplnit do `journey.spec.ts`

**Interfaces:**

- Produces: `knownMapFor(deps, { playerId, cell }): Promise<{ seen: SeenCell } | null>` (`null` = rod mapu nezná); `knownVillagesOf(deps, { playerId }): Promise<{ cell: GridCell; houseId: string | null }[]>`; `GET /api/journey?known=x,y` → `{ map, seen }`, neznámá mapa 404.

- [ ] **Step 1: Testy:** neznámá mapa → `null`; známá → `seen`; hráč nedostane znalost cizího rodu. E2e: se znalostí zapsanou do databáze oko u rodu otevře scénu s `data-cell` a známými stavbami, ⌂ vrátí na ves; u rodu bez známé mapy je oko zašedlé s „Tu mapu rod nezná.“; má-li rod víc známých map téhož rodu, další klik přepne na další.
- [ ] **Step 2–4:** FAIL → implementace (scéna jako cizí mapa bez jezdců: odkryté šeré, stavby naposled viděné, nic živého) → PASS.
- [ ] **Step 5:** `docs/code/journey.md` (Známá mapa), `docs/code/web-ui.md`; commit `feat(web): známá mapa z domova`. **Pak Martinova vizuální kontrola.**

## Část 3 – Šelmy

### Úloha 13: Šelmy v hustém lese (po Úloze 6, nezávisle na části 2)

**Files:**

- Create: `packages/game/src/domain/war/journey-predators.ts`
- Modify: `journey.ts` (denní krok), `domain/village/core/inbox.ts` (událost `journey-casualty`), typy kroniky, zvěř prázdné mapy ve `domain/village/wildlife/` (stropy z krajiny kolem středu mapy), `docs/design/wildlife.md` (věta „zvěř nikoho nezraní mimo lov“ → odkaz na výjezd), `docs/code/village-wildlife.md`
- Test: `packages/game/src/domain/war/__tests__/journey-predators.test.ts`, doplnit testy schránky vsi

**Interfaces:**

- Consumes: čísla a funkce zranění a smrti na lovu z `rules-wildlife.ts` a lovu rodu – **žádná nová čísla**; `MARCH_FOREST`, `freshWildlife`, `wildlifeCaps`.
- Produces: `predatorDay(input: { members: readonly JourneyMember[]; inForest: boolean; wildlife: { bear: boolean; wolves: boolean }; seed: number; day: number }): { index: number; outcome: 'wounded' | 'dead'; by: 'bear' | 'wolves' }[]`; událost `{ kind: 'journey-casualty'; journeyId: string; personId: number; outcome: 'wounded' | 'dead'; by: 'bear' | 'wolves' }`.

- [ ] **Step 1: Testy:** tři muži nikdy; mimo hustý les nikdy; mapa bez medvěda i vlků nikdy; mapa se vsí bere stav zvěře té vsi pro celou mapu (ulovený medvěd = bezpečno), prázdná mapa zvěř na stropu podle krajiny; s medvědem zranění 5 % × (1 − boj ÷ 200) a smrt 0,3 % × (2 − boj ÷ 100), pěšky smrt × 2; jen s vlky čísla lovu prasat (0,5 % a 0,02 %) – četnost přes 20 000 seedů v toleranci; zraněný má `wounded` a `woundedDay`, ves dostane `journey-casualty` a muž je 60 dní raněný jako po lovu; mrtvý má `status: 'fallen'`, ves zapíše smrt s kronikou „Bořivoje zabil na cestě medvěd.“ nebo „Bořivoje zabili na cestě vlci.“ a nástupnictví proběhne běžnou cestou; po smrti vojvody se zbytek vrací sám.
- [ ] **Step 2–4:** FAIL → implementace (los ze seedu výjezdu a dne; den se počítá, stojí-li skupina na začátku dne v hustém lese) → PASS, `npm run test:slow`.
- [ ] **Step 5:** `docs/code/journey.md` (Šelmy); commit `feat(game): šelmy napadají osamělé na cestě hustým lesem`.

## Po tomto plánu

Krok 4 návrhu – **boj v poli** (výpad obránců, střet s nepřátelským tažením, zajetí muže obráncem) – dostane vlastní plán. Do té doby `commandJourney` odmítá vjezd na mapu rodu ve válce („Tam je válka.“) a výjezd, který na takové mapě stojí při začátku války, jede domů.
