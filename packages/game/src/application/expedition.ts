import type { WorldClock } from '../domain/calendar';
import type { Landscape } from '../domain/landscape';
import { villageManor, villageManorId } from '../domain/village/people/manor';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import type { VillageState } from '../domain/village/types';
import { sendAway } from '../domain/vassalage';
import {
  expeditionRecruit,
  INTENT_LEAD_TICKS,
  marchGrid,
  newJourney,
  partyLeader,
  riderHorse,
  tickOfMs,
  upgradeJourney,
  type CampaignMap,
  type CampaignPlace,
  type CampaignVillage,
  type ExpeditionPersonRefusal,
  type JourneyCommand,
  type JourneyMember,
  type JourneyOrder,
  type JourneyRecruit,
  type JourneyState,
  type MarchGrid,
  type Pos,
} from '../domain/war';
import { recruitMember } from '../domain/war/journey-parties';
import { mapGrid } from './campaign-view';
import type { CampaignCells, CampaignRepository } from './campaigns';
import type { HouseRepository } from './houses';
import { orderAim } from './journey-order';
import type { JourneyRepository } from './journeys';
import {
  editVillage,
  findPlayerVillage,
  type PlayerVillage,
  type PlayerVillagesDeps,
} from './player-villages';
import type { SeedSource } from './settlements';
import { villagePlace } from './plan-campaign';
import type { VillageRepository } from './villages';

// Rozkaz vybraným lidem a přidání lidí ze vsi (expeditions.md – Kdo smí jít, Výběr a skupina,
// Koně; plán 2026-11-14 – Rozhodnutí 1, 3 a 11, Úloha 5). Web pošle id vybraných lidí a příkaz;
// use-case výběr rozdělí na lidi, kteří už ve výpravě domovské vsi jsou (členové), a způsobilé lidi
// ze vsi (rekruti), ověří příkaz a zapíše ho jako záměr výpravy – krok výpravy (`applyCommand`)
// podle id lidí skupiny dělí, spojuje a nové lidi přidá. Rozkaz jen členům jde bez zámku vsi
// (`commandParty`), s rekruty přes zámek hráče a úpravu vsi (`musterExpedition`). Jedna běžící
// výprava na domovskou ves hráče (`activeIn`).

/** Příkaz hráče vybraným lidem: rozkaz (Jdi sem, Přes okraj, Domů), Osedlat, Sesednout. */
export type ExpeditionCommand =
  { kind: 'order'; order: JourneyOrder } | { kind: 'saddle' } | { kind: 'dismount' };

/**
 * Proč příkaz nejde: důvod člověka (`ExpeditionPersonRefusal` – nikdo jiný z výběru nemůže), cizí
 * ves (`no-village`), z výběru nemůže nikdo (`nobody`), rekruti z napadené vsi
 * (`village-attacked`), tam nedojdou (`unreachable`), tam je válka (`war-there`), jezdci venku mají
 * koně doma (`horse-home`).
 */
export type ExpeditionRefusal =
  | ExpeditionPersonRefusal
  | 'no-village'
  | 'nobody'
  | 'village-attacked'
  | 'unreachable'
  | 'war-there'
  | 'horse-home';

export type ExpeditionResult =
  { ok: true; journeyId: string } | { ok: false; reason: ExpeditionRefusal };

export interface ExpeditionInput {
  playerId: string;
  /** Domovská ves vybraných lidí – výběr přes dvě vsi nejde (Rozhodnutí 1). */
  villageId: string;
  /** Id vybraných lidí vsi (celá čísla, bez duplicit, 1–200). */
  people: number[];
  command: ExpeditionCommand;
  now: Date;
}

export interface ExpeditionDeps extends PlayerVillagesDeps {
  /** Cizí vojsko na mapě vsi (`activeAgainst`). */
  campaigns: Pick<CampaignRepository, 'activeAgainst'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  villages: VillageRepository;
  journeys: Pick<JourneyRepository, 'activeIn' | 'checkpoint' | 'create' | 'addIntent'>;
  /** Mapy políček – krajina a překážky pro ověření rozkazu a domov výpravy. */
  cells: CampaignCells;
  world: WorldClock;
  seeds: SeedSource;
  /** Nové id výpravy (uuid). */
  newId: () => string;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku (`houseAtWarOn`)? */
  atWar: (playerId: string, cell: GridCell) => Promise<boolean>;
}

/** Nejvíc lidí v jednom výběru – ochrana vstupu (návrh Clauda), ne pravidlo hry. */
const MAX_PEOPLE = 200;

/**
 * Rozkaz lidem, kteří už ve výpravě jsou – záměr na takt teď + `INTENT_LEAD_TICKS` bez zámku
 * a bez zápisu do vsi (Rozhodnutí 11). Je-li ve výběru někdo, kdo by šel ze vsi (rekrut), nezapíše
 * nic a vrátí `recruits` – volající pak pod zámkem hráče zavolá `musterExpedition`. Nezpůsobilí
 * z výběru vypadnou; nemůže-li nikdo, důvod prvního z nich (jinak `nobody`).
 */
export async function commandParty(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
): Promise<ExpeditionResult | { ok: false; reason: 'recruits' }> {
  const picked = await select(deps, input);
  if (!picked.ok) return picked;
  if (picked.chosen.recruits.length > 0) return { ok: false, reason: 'recruits' };
  // jen členové – výprava běží a domov je její
  const plan: Plan = { ...picked, home: picked.situation.journey!.home, houseId: null };
  const refusal = await verify(deps, input, plan);
  if (refusal !== null) return { ok: false, reason: refusal };
  const { journeyId, journey } = plan.situation;
  const queued = await queue(deps, input, journeyId!, journey!.tick, memberIds(plan.chosen));
  return queued ? journeyOk(journeyId!) : NOBODY;
}

/**
 * Vybraní lidé dostanou příkaz a způsobilí lidé ze vsi se k výpravě domovské vsi přidají – volající
 * drží zámek hráče (web `guardedAction`):
 * 1. ves – rekruti odejdou (`away: journey` s id výpravy, bez výpravy nové `newId()`); ověří se
 *    znovu na čerstvém stavu vsi (souběžný zápis) – kdo mezitím nesmí, příkaz odmítne celý;
 * 2. bez výpravy ji založí (`newJourney` s rekruty a rozkazem); Osedlat a Sesednout jdou hned
 *    po založení jako záměr;
 * 3. s výpravou záměr s id členů a rekruty (`addIntent`);
 * 4. výprava mezitím skončila (`addIntent` null) – rekruti se vrátí (`away` zmizí) a vše se jednou
 *    zopakuje od začátku (s novou výpravou); podruhé výběr odmítne (`nobody`);
 * 5. založení selže – rekruti se vrátí a chyba jde dál.
 * Záměr přijatý těsně před koncem výpravy, na který už krok nedojde, kryje poslední `away-ends`
 * výpravy bez `personIds` (vrátí každého s jejím id – `journey.ts`, `finishGroup`).
 */
export async function musterExpedition(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
): Promise<ExpeditionResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const picked = await select(deps, input);
    if (!picked.ok) return picked;
    const plan = await homeOf(deps, input, picked);
    if (!plan.ok) return plan;
    const refusal = await verify(deps, input, plan);
    if (refusal !== null) return { ok: false, reason: refusal };
    const done = await carryOut(deps, input, plan);
    if (done !== 'ended') return done;
  }
  return NOBODY;
}

const NOBODY = { ok: false, reason: 'nobody' } as const;

function journeyOk(journeyId: string): { ok: true; journeyId: string } {
  return { ok: true, journeyId };
}

/** Ves hráče a běžící výprava její domovské vsi (kontrolní bod, starší převede `upgradeJourney`). */
interface Situation {
  own: PlayerVillage;
  /** Den vsi (`lastDay`) – podle něj se ověřují lidé a koně. */
  day: number;
  journeyId: string | null;
  journey: JourneyState | null;
}

/** Komu příkaz platí: členové výpravy a rekruti ze vsi, oba v pořadí výběru. */
interface Chosen {
  members: JourneyMember[];
  recruits: JourneyRecruit[];
}

/** Výběr rozdělený podle příkazu (`select`) – bez domova výpravy. */
interface Picked {
  ok: true;
  situation: Situation;
  chosen: Chosen;
  /** Mapy načtené během use-case (domov, ověření rozkazu) – podle `x,y`. */
  maps: Map<string, CampaignMap>;
}

interface Plan extends Picked {
  /** Domov výpravy – běžící, nebo nové (dvorec vsi). */
  home: CampaignVillage;
  /** Rod hráče pro novou výpravu; s běžící výpravou null. */
  houseId: string | null;
}

/**
 * Výběr hráče rozdělený podle příkazu (bez zápisu a bez dotazu na rod a mapy): špatný výběr
 * (`nobody`), cizí ves (`no-village`), nikdo nemůže (důvod prvního odmítnutého, jinak `nobody`).
 */
async function select(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
): Promise<Picked | { ok: false; reason: ExpeditionRefusal }> {
  if (!validPeople(input.people)) return NOBODY;
  const own = await findPlayerVillage(deps, input);
  if (!own) return { ok: false, reason: 'no-village' };
  const id = await deps.journeys.activeIn(input.playerId, own.village.id);
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const journey = point ? upgradeJourney(point.state) : null;
  const situation: Situation = {
    own,
    day: own.village.state.lastDay,
    journeyId: journey ? id : null,
    journey,
  };
  const split = splitPeople(situation, input.people);
  const chosen = chooseFor(input.command, split, journey);
  if (chosen.members.length === 0 && chosen.recruits.length === 0) {
    return { ok: false, reason: split.refusal ?? 'nobody' };
  }
  return { ok: true, situation, chosen, maps: new Map() };
}

/**
 * Domov výpravy: běžící výpravy, jinak nové – rod hráče (`no-village`) s místem na mapě světa
 * (`unreachable`) a dvorec vsi (`journeyHome`).
 */
async function homeOf(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
  picked: Picked,
): Promise<Plan | { ok: false; reason: ExpeditionRefusal }> {
  const { own, journey } = picked.situation;
  if (journey) return { ...picked, home: journey.home, houseId: null };
  const house = await deps.houses.activeOf(input.playerId);
  const cell = own.settlement.worldCell;
  if (!house) return { ok: false, reason: 'no-village' };
  if (house.placedAt === null || !cell) return { ok: false, reason: 'unreachable' };
  const map = await mapOn(deps, picked.maps, cell);
  const home: CampaignVillage = {
    villageId: own.village.id,
    name: own.village.name,
    cell: { ...cell },
    pos: journeyHome(own.village.state, cell, map.landscape),
  };
  return { ...picked, home, houseId: house.id };
}

/** Celá čísla bez duplicit, 1–`MAX_PEOPLE` (vstup od klienta). */
function validPeople(people: unknown): people is number[] {
  if (!Array.isArray(people) || people.length === 0 || people.length > MAX_PEOPLE) return false;
  const seen = new Set<number>();
  for (const id of people) {
    if (!Number.isInteger(id) || seen.has(id as number)) return false;
    seen.add(id as number);
  }
  return true;
}

/**
 * Rozdělení výběru (Rozhodnutí 3): člen = osoba s `away: journey` běžící výpravy, která je v jejím
 * bodu živá a jejíž skupina hráče poslouchá (ne `leaderless`); ostatní přes `expeditionRecruit` –
 * nezpůsobilí vypadnou (první důvod se pamatuje). Kdo z hloučku právě došel domů (v bodu už není,
 * ves ho má pryč do `away-ends`), je tak `away`. Id, které ve vsi není, se přeskočí.
 */
function splitPeople(
  situation: Situation,
  people: readonly number[],
): Chosen & { refusal: ExpeditionPersonRefusal | null } {
  const { own, day, journey } = situation;
  const state = own.village.state;
  const persons = new Map(state.people.map((p) => [p.id, p]));
  const members = journey ? commandable(journey) : new Map<number, JourneyMember>();
  const out: Chosen & { refusal: ExpeditionPersonRefusal | null } = {
    members: [],
    recruits: [],
    refusal: null,
  };
  for (const id of people) {
    const person = persons.get(id);
    if (!person) continue;
    const away = person.away;
    const member =
      away?.kind === 'journey' && away.refId === journey?.id ? members.get(id) : undefined;
    if (member) {
      out.members.push(member);
      continue;
    }
    const recruit = expeditionRecruit(state, person, day, own.village.id);
    if (typeof recruit === 'string') out.refusal ??= recruit;
    else out.recruits.push(recruit);
  }
  return out;
}

/** Živí lidé výpravy ve skupinách, které hráče poslouchají (ne `leaderless`), podle id osoby. */
function commandable(s: JourneyState): Map<number, JourneyMember> {
  const leaderless = new Set(s.parties.filter((p) => p.leaderless).map((p) => p.id));
  const partyOf = new Map(s.groups.map((g) => [g.id, g.party]));
  return new Map(
    s.members
      .filter((m) => m.status === 'active' && !leaderless.has(partyOf.get(m.group)!))
      .map((m) => [m.ref.personId, m]),
  );
}

/**
 * Kdo příkaz dostane: rozkaz – všichni; Osedlat – členové skupin, které s koňmi nepracují, a ze
 * vsi jen jezdci (návrh Clauda – ostatní pracují dál, přidá je až rozkaz); Sesednout – jen členové
 * skupin bez práce s koňmi (lidé ze vsi na koni nesedí). Skupina s prací s koňmi Osedlat ani
 * Sesednout nevidí (`journey-parties.ts`).
 */
function chooseFor(
  command: ExpeditionCommand,
  split: Chosen,
  journey: JourneyState | null,
): Chosen {
  if (command.kind === 'order') return { members: split.members, recruits: split.recruits };
  const busy = new Set(journey?.parties.filter((p) => p.horseWork).map((p) => p.id) ?? []);
  const partyOf = new Map(journey?.groups.map((g) => [g.id, g.party]) ?? []);
  const members = split.members.filter((m) => !busy.has(partyOf.get(m.group)!));
  if (command.kind === 'dismount') return { members, recruits: [] };
  return { members, recruits: split.recruits.filter((r) => r.horseId !== undefined) };
}

/**
 * Ověření příkazu (null = jde): s rekruty napřed cizí vojsko na mapě vsi (`activeAgainst` →
 * `village-attacked`); rozkaz přes `orderAim` z hloučku vůdce výběru (rekruti stojí doma) –
 * `go.cell` musí být políčko někoho z výběru; Osedlat a Sesednout podle koní.
 */
async function verify(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
  plan: Plan,
): Promise<ExpeditionRefusal | null> {
  const { chosen } = plan;
  if (
    chosen.recruits.length > 0 &&
    (await deps.campaigns.activeAgainst(plan.situation.own.village.id)).length > 0
  ) {
    return 'village-attacked';
  }
  switch (input.command.kind) {
    case 'order':
      return verifyOrder(deps, input, plan, input.command.order);
    case 'saddle':
      return saddleRefusal(plan);
    case 'dismount':
      return chosen.members.some((m) => m.horse === 'ridden') ? null : 'nobody';
    default:
      // typy druh vyčerpaly, za běhu přijde cokoli od klienta
      input.command satisfies never;
      return 'nobody';
  }
}

/**
 * Rozkaz (lord-control.md – Rozkazy; Rozhodnutí 3): měří se od místa vůdce výběru (`partyLeader`
 * – jako krok výpravy; rekrut stojí doma), „Jdi sem“ s políčkem od vůdce těch z výběru, kdo na
 * něm stojí (nikdo – `unreachable`). Špatný vstup a místo, kam nedojdou, je `unreachable`; políčko
 * cíle rodu ve válce `war-there`.
 */
async function verifyOrder(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
  plan: Plan,
  order: JourneyOrder,
): Promise<ExpeditionRefusal | null> {
  const groups = new Map(plan.situation.journey?.groups.map((g) => [g.id, g]) ?? []);
  const places = [
    ...plan.chosen.members.map((m) => ({ who: m, at: groups.get(m.group)! as CampaignPlace })),
    ...plan.chosen.recruits.map((r) => ({ who: recruitMember(r, -1), at: plan.home })),
  ];
  const wanted = order.kind === 'go' && order.cell !== undefined ? order.cell : null;
  const candidates = wanted ? places.filter((p) => sameCell(p.at.cell, wanted)) : places;
  const leader = partyLeader(candidates.map((p) => p.who));
  const from = candidates.find((p) => p.who === leader)?.at;
  if (!from) return 'unreachable';
  const grid = order.kind === 'go' ? await gridOn(deps, plan, from.cell) : null;
  const aim = orderAim(order, from.cell, from.pos, () => grid!);
  if (aim === 'invalid' || aim === 'unreachable') return 'unreachable';
  if (aim !== null && (await deps.atWar(input.playerId, aim))) return 'war-there';
  return null;
}

/**
 * Osedlat (expeditions.md – Koně): jde, má-li výběr jezdce ze vsi (kůň v ohradě), jezdce s koněm
 * vedeným za uzdu, nebo jezdce bez koně u sebe na domovské mapě, jehož kůň je v ohradě
 * (`riderHorse`). Jinak mají-li jezdci venku koně v ohradě – „Kůň je doma.“ (`horse-home`), jinak
 * `nobody`.
 */
function saddleRefusal(plan: Plan): ExpeditionRefusal | null {
  if (plan.chosen.recruits.length > 0) return null;
  const { own, day, journey } = plan.situation;
  const groups = new Map(journey?.groups.map((g) => [g.id, g]) ?? []);
  let horseHome = false;
  for (const m of plan.chosen.members) {
    if (m.horse === 'led') return null;
    if (m.horse !== undefined) continue;
    const penned = riderHorse(own.village.state, m.ref.personId, m.horseId, day) !== null;
    if (!penned) continue;
    if (sameCell(groups.get(m.group)!.cell, plan.home.cell)) return null;
    horseHome = true;
  }
  return horseHome ? 'horse-home' : 'nobody';
}

/** Mapa políčka – jednou za use-case (`CampaignCells.mapOf`). */
async function mapOn(
  deps: ExpeditionDeps,
  maps: Map<string, CampaignMap>,
  cell: GridCell,
): Promise<CampaignMap> {
  const key = `${cell.x},${cell.y}`;
  let map = maps.get(key);
  if (!map) {
    map = await deps.cells.mapOf(cell);
    maps.set(key, map);
  }
  return map;
}

/**
 * Mřížka pochodu mapy `cell` ve dni vsi: domovská mapa s čerstvým stavem vlastní vsi (jako dřív
 * vyslání), jiná mapa s vsí na ní (`mapGrid`).
 */
async function gridOn(deps: ExpeditionDeps, plan: Plan, cell: GridCell): Promise<MarchGrid> {
  const { own, day } = plan.situation;
  if (!sameCell(cell, plan.home.cell)) return mapGrid(deps, cell, day);
  const map = await mapOn(deps, plan.maps, cell);
  return marchGrid(map.landscape, map.obstacles, own.village.state, { day });
}

/**
 * Zápis (kroky 1–3 a 5 `musterExpedition`): bez rekrutů jen záměr. `ended` – výprava mezitím
 * skončila (`addIntent` null), rekruti jsou zase doma.
 */
async function carryOut(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
  plan: Plan,
): Promise<ExpeditionResult | 'ended'> {
  const { situation, chosen } = plan;
  if (chosen.recruits.length === 0) {
    const id = situation.journeyId!;
    const queued = await queue(deps, input, id, situation.journey!.tick, memberIds(chosen));
    return queued ? journeyOk(id) : 'ended';
  }
  const villageId = situation.own.village.id;
  const journeyId = situation.journeyId ?? deps.newId();
  let sent: JourneyRecruit[] = [];
  const failed = await editVillage<ExpeditionRefusal>(
    deps.villages,
    villageId,
    (fresh) => {
      const again = freshRecruits(fresh, chosen.recruits, input.command, villageId);
      if (typeof again === 'string') return again;
      sendAway(
        fresh,
        fresh.lastDay,
        again.map((r) => r.ref.personId),
        { kind: 'journey', refId: journeyId },
      );
      sent = again;
      return null;
    },
    'no-village',
  );
  if (failed !== null) return { ok: false, reason: failed };
  const ids = sent.map((r) => r.ref.personId);

  if (situation.journeyId === null) {
    const first = input.command.kind === 'order' ? cleanOrder(input.command.order) : undefined;
    try {
      await deps.journeys.create(
        newJourney(
          {
            id: journeyId,
            seed: deps.seeds.nextSeed(),
            playerId: input.playerId,
            houseId: plan.houseId!,
            home: plan.home,
            recruits: sent,
            startMs: input.now.getTime(),
            ...(first ? { order: first } : {}),
          },
          deps.world,
        ),
        input.now,
      );
    } catch (error) {
      await release(deps.villages, villageId, journeyId, ids);
      throw error;
    }
    // Osedlat a Sesednout jako první příkaz: lidé už jsou ve výpravě (skupina 0 doma); záměr, který
    // by nevyšel, je nechá stát doma – po čekání se vrátí
    if (!first) await queue(deps, input, journeyId, -Infinity, ids);
    return journeyOk(journeyId);
  }
  const since = situation.journey!.tick;
  if (await queue(deps, input, journeyId, since, memberIds(chosen), sent)) {
    return journeyOk(journeyId);
  }
  await release(deps.villages, villageId, journeyId, ids);
  return 'ended';
}

function memberIds(chosen: Chosen): number[] {
  return chosen.members.map((m) => m.ref.personId);
}

/**
 * Rekruti ověření znovu na čerstvém stavu vsi (souběžný zápis): data z čerstvého stavu; kdo mezitím
 * nesmí (Osedlat – nebo už nemá koně), odmítne celý příkaz svým důvodem.
 */
function freshRecruits(
  state: VillageState,
  recruits: readonly JourneyRecruit[],
  command: ExpeditionCommand,
  villageId: string,
): JourneyRecruit[] | ExpeditionRefusal {
  const day = state.lastDay;
  const out: JourneyRecruit[] = [];
  for (const r of recruits) {
    const person = state.people.find((p) => p.id === r.ref.personId);
    const now = person ? expeditionRecruit(state, person, day, villageId) : 'away';
    if (typeof now === 'string') return now;
    if (command.kind === 'saddle' && now.horseId === undefined) return 'nobody';
    out.push(now);
  }
  return out;
}

/**
 * Záměr výpravy `journeyId` na takt teď + `INTENT_LEAD_TICKS`, nejdřív za kontrolním bodem `since`,
 * který use-case četl: příkaz lidem výpravy `people` (id) a novým lidem `recruits`. Zapsán – true;
 * výprava skončila (nebo bod je už za taktem) – false.
 */
async function queue(
  deps: ExpeditionDeps,
  input: ExpeditionInput,
  journeyId: string,
  since: number,
  people: number[],
  recruits: JourneyRecruit[] = [],
): Promise<boolean> {
  const tick = Math.max(tickOfMs(input.now.getTime(), deps.world), since) + INTENT_LEAD_TICKS;
  const body = bodyOf(input.command, people, recruits);
  return (
    (await deps.journeys.addIntent(journeyId, { tick, byPlayer: input.playerId, body })) !== null
  );
}

/** Tělo záměru – rozkaz lidem `people` (nikdy bez nich – chybí = všem), noví lidé jen s nimi. */
function bodyOf(
  command: ExpeditionCommand,
  people: number[],
  recruits: JourneyRecruit[],
): JourneyCommand {
  const fresh = recruits.length > 0 ? { recruits } : {};
  switch (command.kind) {
    case 'order':
      return { kind: 'order', order: cleanOrder(command.order), people, ...fresh };
    case 'saddle':
      return { kind: 'saddle', people, ...fresh };
    case 'dismount':
      return { kind: 'dismount', people };
  }
}

/** Rozkaz bez polí navíc od klienta (do záměru i bodu jde jen tvar `JourneyOrder`). */
function cleanOrder(order: JourneyOrder): JourneyOrder {
  switch (order.kind) {
    case 'go':
      return {
        kind: 'go',
        pos: { x: order.pos.x, z: order.pos.z },
        ...(order.cell ? { cell: { x: order.cell.x, y: order.cell.y } } : {}),
      };
    case 'cross':
      return { kind: 'cross', cell: { x: order.cell.x, y: order.cell.y } };
    case 'home':
      return { kind: 'home' };
  }
}

/**
 * Vrátí rekruty `ids` domů (výpravu se nepovedlo založit, nebo mezitím skončila): `away` výpravy
 * `journeyId` zmizí – jen jim, členové výpravy se vracejí jejím `away-ends`.
 */
async function release(
  villages: VillageRepository,
  villageId: string,
  journeyId: string,
  ids: readonly number[],
): Promise<void> {
  const back = new Set(ids);
  await editVillage<'gone'>(
    villages,
    villageId,
    (state) => {
      for (const p of state.people) {
        if (back.has(p.id) && p.away?.kind === 'journey' && p.away.refId === journeyId) {
          delete p.away;
        }
      }
      return null;
    },
    'gone',
  );
}

/**
 * Odkud výprava vyjíždí a kam se vrací (lord-control.md – Rozkazy: „Domů – nejkratší cestou do
 * vlastní vsi“; Ve scéně: odjezd branou dvorce): dvorec vsi. Hráč staví ves, kde chce – místo vsi
 * krajiny (`villagePlace`) od ní může ležet daleko (Martinův Vlkov ≈ 430 m). Dokud zakladatelé
 * první zemnici staví, staveniště dvorce; ves bez obydlí i staveniště – místo vsi krajiny.
 */
function journeyHome(state: VillageState, cell: GridCell, landscape: Landscape): Pos {
  const manorId = villageManorId(state);
  const site =
    manorId === null
      ? undefined
      : state.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === manorId);
  const at = villageManor(state)?.position ?? site?.position;
  return at ? { x: at.x, z: at.z } : villagePlace(cell, landscape).pos;
}
