import type { DwellingType } from '../village/types';
import { sameCell, type GridCell } from '../village/world-grid';
import type { BattleOutcome, Fighter, FighterState } from './battle';
import type {
  CampaignMemberStatus,
  CampaignPhase,
  CampaignPlace,
  CampaignReturnReason,
  CampaignState,
  CampaignVillage,
  GroupOrder,
  SurrenderOrder,
} from './campaign-types';
import type { MarchGrid, Pos } from './march-grid';
import { inSight } from './sight';

// Pohled hráče na tažení (war.md – Mlha války, Velení; plán 2026-11-03 – Úloha 6.14): vlastní muži
// celí, cizí jen v dohledu vlastních mužů, stavby cílové vsi jen objevené. Nic dalšího o stavu
// cizí vsi pohled nenese – server je jediná autorita a klient kreslí jen to, co hráč smí vidět.

/** Vlastní muž tažení – celý stav. */
export interface CampaignViewMan {
  /** Pořadí muže v tažení (`CampaignState.members`) – klíč pro interpolaci i scénu. */
  member: number;
  line: boolean;
  mounted: boolean;
  wounded: boolean;
  /** Zdraví 0–100. */
  health: number;
  status: CampaignMemberStatus;
  group: number;
  cell: GridCell;
  pos: Pos;
  /** Velitel tažení (hráč ho řídí jako hrdinu v 0 A.D., vede-li živě). */
  commander: boolean;
  deputy: boolean;
  /** Stav v boji; mimo boj null. */
  fight: FighterState | null;
}

/** Muž téhož vojska, který patří jinému hráči (vazal ve službě) – jen poloha a vzhled. */
export interface CampaignViewAlly {
  member: number;
  line: boolean;
  mounted: boolean;
  status: CampaignMemberStatus;
  group: number;
  cell: GridCell;
  pos: Pos;
  fight: FighterState | null;
}

/** Cizí bojovník v dohledu vlastních mužů (na mapě cíle). */
export interface CampaignViewForeign {
  /** Id bojovníka (`Fighter.id`) – cíl rozkazu „napadni“. */
  id: string;
  line: boolean;
  mounted: boolean;
  bow: boolean;
  state: FighterState;
  pos: Pos;
}

/** Objevená stavba cílové vsi. */
export interface CampaignViewBuilding {
  id: number;
  type: DwellingType;
  pos: Pos;
}

/** Skupina vojska – poloha, rozkaz a cíl. */
export interface CampaignViewGroup {
  id: number;
  order: GroupOrder;
  cell: GridCell;
  pos: Pos;
  goal: CampaignPlace | null;
  arrived: boolean;
  holdAt: Pos | null;
  /** Ve skupině je aspoň jeden vlastní muž. */
  own: boolean;
}

/**
 * Skupina uprchlíků nebo posel cizí vsi v dohledu vlastních mužů (war.md – Varování, poslové a útěk
 * do hradiště; Ú14 – ikona na mapě tažení): kde je, kolik lidí a kusů dobytka – nic dalšího.
 */
export interface CampaignViewFlight {
  refId: string;
  kind: 'refugees' | 'messenger';
  cell: GridCell;
  pos: Pos;
  /** Lidí (posel 1). */
  people: number;
  /** Kusů dobytka (posel 0). */
  herd: number;
  /** Posel na koni. */
  mounted: boolean;
}

/** Pohled hráče na tažení – jen co smí vidět. */
export interface CampaignView {
  id: string;
  /** Takt stavu (poloha mužů na jeho konci). */
  tick: number;
  /** Stav je novější než `sinceTick` z dotazu (jinak se nic nepohnulo). */
  fresh: boolean;
  day: number;
  phase: CampaignPhase;
  /** Hráč je vůdce tažení. */
  leader: boolean;
  /** Hráč vede živě – velí jeho muž, který stojí na nohou (war.md – Velení). */
  liveCommand: boolean;
  /** Hráč byl pryč déle než 1 herní den a vede zástupce (po návratu velení převezme). */
  absent: boolean;
  assembly: CampaignVillage;
  target: CampaignVillage;
  groups: CampaignViewGroup[];
  men: CampaignViewMan[];
  allies: CampaignViewAlly[];
  foreign: CampaignViewForeign[];
  /**
   * Skupiny uprchlíků a běžící poslové v dohledu vlastních mužů na nohou (na kterékoli mapě; mimo
   * mapu cíle dohled jako v lese). Chybí – žádné.
   */
  flights?: CampaignViewFlight[];
  discovered: CampaignViewBuilding[];
  /** Volba ke vzdaným (u živého vedení). */
  surrendered: SurrenderOrder | null;
  battle: { outcome: BattleOutcome } | null;
  returnReason: CampaignReturnReason | null;
}

/** Vstup pohledu: kdo se dívá, mřížka mapy cíle (dohled v lese) a stavby cílové vsi. */
export interface CampaignViewInput {
  playerId: string;
  sinceTick: number;
  /** Mřížka pochodu mapy cíle; null = dohled všude jako v lese (jen v boji je potřeba). */
  grid: MarchGrid | null;
  /** Stavby cílové vsi – do pohledu jdou jen objevené (`discovered`). */
  buildings: readonly { id: number; type: DwellingType; position: Pos }[];
}

/** Je hráč účastníkem tažení – vůdce, nebo má ve vojsku vlastního muže? */
export function isCampaignParticipant(state: CampaignState, playerId: string): boolean {
  return state.playerId === playerId || state.members.some((m) => m.playerId === playerId);
}

/** Smí hráč živě velet – je vůdce, tažení vede jeho muž a ten stojí na nohou? */
export function leadsLive(state: CampaignState, playerId: string): boolean {
  if (state.playerId !== playerId || !state.liveCommand) return false;
  if (state.phase === 'done' || state.phase === 'disbanded') return false;
  const commander = state.members.find(
    (m) =>
      m.ref.villageId === state.commander.villageId && m.ref.personId === state.commander.personId,
  );
  return (
    commander !== undefined && commander.playerId === playerId && commander.status === 'active'
  );
}

/**
 * Pohled hráče na tažení; hráč, který v tažení nemá ani vůdcovství, ani vlastního muže, dostane
 * null (o cizím tažení se nic nedozví).
 */
export function campaignView(state: CampaignState, input: CampaignViewInput): CampaignView | null {
  const { playerId } = input;
  if (!isCampaignParticipant(state, playerId)) return null;
  const fighters = new Map<number, Fighter>();
  for (const f of state.battle?.fighters ?? []) {
    if (f.side === 'attack') fighters.set(f.ref, f);
  }
  const groups = new Map(state.groups.map((g) => [g.id, g]));
  const sameRef = (a: { villageId: string; personId: number }, b: typeof a | null): boolean =>
    b !== null && a.villageId === b.villageId && a.personId === b.personId;
  const men: CampaignViewMan[] = [];
  const allies: CampaignViewAlly[] = [];
  const eyes: Pos[] = [];
  state.members.forEach((m, member) => {
    const g = groups.get(m.group);
    const f = fighters.get(member);
    const pos = f ? { ...f.pos } : g ? { ...g.pos } : { ...state.assembly.pos };
    const cell = f ? { ...state.target.cell } : g ? { ...g.cell } : { ...state.assembly.cell };
    const fight = f?.state ?? null;
    if (m.playerId !== playerId) {
      allies.push({
        member,
        line: m.line,
        mounted: m.mounted,
        status: m.status,
        group: m.group,
        cell,
        pos,
        fight,
      });
      return;
    }
    men.push({
      member,
      line: m.line,
      mounted: m.mounted,
      wounded: m.wounded,
      health: m.health,
      status: m.status,
      group: m.group,
      cell,
      pos,
      commander: sameRef(m.ref, state.commander),
      deputy: sameRef(m.ref, state.deputy),
      fight,
    });
    // dohlédne jen muž na nohou na mapě cíle (cizí jsou jen tam)
    const onTarget = cell.x === state.target.cell.x && cell.y === state.target.cell.y;
    const standing =
      m.status === 'active' &&
      (fight === null || fight === 'fight' || fight === 'breach' || fight === 'climb');
    if (onTarget && standing) eyes.push(pos);
  });
  const foreign: CampaignViewForeign[] = [];
  for (const f of state.battle?.fighters ?? []) {
    if (f.side !== 'defend') continue;
    if (!eyes.some((e) => inSight(input.grid, e, f.pos))) continue;
    foreign.push({
      id: f.id,
      line: f.line,
      mounted: f.mounted,
      bow: f.bow,
      state: f.state,
      pos: { ...f.pos },
    });
  }
  const flights = flightsInSight(state, men, input.grid);
  const known = new Set(state.discovered);
  const discovered = input.buildings
    .filter((b) => known.has(b.id))
    .map((b) => ({ id: b.id, type: b.type, pos: { x: b.position.x, z: b.position.z } }));
  const ownGroups = new Set(men.map((m) => m.group));
  return {
    id: state.id,
    tick: state.tick,
    fresh: state.tick > input.sinceTick,
    day: state.day,
    phase: state.phase,
    leader: state.playerId === playerId,
    liveCommand: leadsLive(state, playerId),
    absent: state.playerId === playerId && state.absent === true,
    assembly: structuredClone(state.assembly),
    target: structuredClone(state.target),
    groups: state.groups.map((g) => ({
      id: g.id,
      order: g.order,
      cell: { ...g.cell },
      pos: { ...g.pos },
      goal: g.goal ? structuredClone(g.goal) : null,
      arrived: g.arrived,
      holdAt: g.holdAt ? { ...g.holdAt } : null,
      own: ownGroups.has(g.id),
    })),
    men,
    allies,
    foreign,
    ...(flights.length > 0 ? { flights } : {}),
    discovered,
    surrendered: state.surrendered ?? null,
    battle: state.battle ? { outcome: state.battle.outcome } : null,
    returnReason: state.returnReason,
  };
}

/**
 * Skupiny uprchlíků na cestě a běžící poslové v dohledu (`inSight`) vlastních mužů na nohou na téže
 * mapě – mřížka jen na mapě cíle, jinde dohled jako v lese (raději skryje víc). Mlha jako ve scéně
 * (`warSceneView`): ukrytí v lese, skupina v hradišti a posel v cíli vidět nejsou.
 */
function flightsInSight(
  state: CampaignState,
  men: readonly CampaignViewMan[],
  grid: MarchGrid | null,
): CampaignViewFlight[] {
  const alarm = state.alarm;
  if (!alarm) return [];
  const eyes = men.filter(
    (m) =>
      m.status === 'active' &&
      (m.fight === null || m.fight === 'fight' || m.fight === 'breach' || m.fight === 'climb'),
  );
  const sees = (cell: GridCell, pos: Pos): boolean =>
    eyes.some(
      (m) =>
        m.cell.x === cell.x &&
        m.cell.y === cell.y &&
        inSight(sameCell(cell, state.target.cell) ? grid : null, m.pos, pos),
    );
  const out: CampaignViewFlight[] = [];
  for (const f of alarm.flights) {
    if (f.status !== 'marching' || !sees(f.cell, f.pos)) continue;
    const lost = new Set(f.lost ?? []);
    out.push({
      refId: f.refId,
      kind: 'refugees',
      cell: { ...f.cell },
      pos: { ...f.pos },
      people: f.people.filter((p) => !lost.has(p.id)).length,
      herd: Object.values(f.herd).reduce((n, k) => n + k, 0),
      mounted: false,
    });
  }
  for (const m of alarm.messengers) {
    if (m.status !== 'running' || !sees(m.cell, m.pos)) continue;
    out.push({
      refId: m.refId,
      kind: 'messenger',
      cell: { ...m.cell },
      pos: { ...m.pos },
      people: 1,
      herd: 0,
      mounted: m.mounted,
    });
  }
  return out;
}
