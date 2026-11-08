import { crossingLayers } from '../village/fortification';
import type { WallKind } from '../village/types';
import { sameCell, type GridCell } from '../village/world-grid';
import type {
  BattleBreach,
  BattleFort,
  BattleGroup,
  BattleOutcome,
  BattleSide,
  BattleState,
  Fighter,
} from './battle';
import type { CampaignGroup, CampaignMember, CampaignState } from './campaign-types';
import type { BattleLadder } from './ladders';
import type { MarchGrid, Pos } from './march-grid';
import { inSight } from './sight';

// Válka ve scéně jedné mapy (war.md – Ve scéně; scene.md – Vojsko, boj a mlha války): co z tažení
// vidí hráč na mapě, kterou má právě ve 3D scéně – vlastní stranu celou, druhou jen v dohledu
// vlastních očí (mlha války jako `campaignView`). Server je jediná autorita, scéna jen kreslí.

/**
 * Bojovník pro scénu – jen co scéna kreslí (žádné `ref`, síla, cíle ani trasy). Zdraví jen u vlastní
 * strany; cizí muž nese hrubý stav (`state` – na nohou / `down`, `killed` – padlý) a počet zásahů
 * `hits` (scéna pozná ránu; přesné zdraví pohled na tažení tají – `CampaignViewForeign`).
 */
export type WarSceneFighter = Pick<
  Fighter,
  | 'id'
  | 'side'
  | 'group'
  | 'line'
  | 'bow'
  | 'mounted'
  | 'hits'
  | 'pos'
  | 'home'
  | 'state'
  | 'cooldown'
  | 'aim'
  | 'killed'
  | 'breachAt'
  | 'ladder'
  | 'onWall'
  | 'underground'
  | 'climb'
> & {
  /** Zdraví 0–100 – jen vlastní strana. */
  health?: number;
};

/** Rozdělaný průlom pro scénu (bez cílů a dalších údajů boje). */
export type WarSceneBreach = Pick<
  BattleBreach,
  'key' | 'fort' | 'segment' | 'spot' | 'at' | 'method' | 'phase' | 'need' | 'moat' | 'progress'
>;

/** Hradba úseku na bojišti: lomená čára, stojící hradba (null – mezera, průlom) a výška valu. */
export interface WarSceneWall {
  fort: number;
  segment: number;
  path: Pos[];
  kind: WallKind | null;
  rampart: number;
}

/** Boj na mapě – jen viditelné. */
export interface WarSceneBattle {
  ticks: number;
  outcome: BattleOutcome;
  fighters: WarSceneFighter[];
  groups: Pick<BattleGroup, 'side' | 'id' | 'order' | 'broken'>[];
  closedGates: string[];
  breaches: WarSceneBreach[];
  ladders: BattleLadder[];
  walls: WarSceneWall[];
}

/** Skupina vojska na pochodu – poloha, rozkaz a směr chůze (jednotkový). */
export type WarSceneGroup = Pick<CampaignGroup, 'id' | 'order' | 'pos' | 'arrived'> & {
  heading: Pos;
};

/** Pochod na mapě – viditelné skupiny a jejich muži (vzhled, ne kdo to je). */
export interface WarSceneMarch {
  members: Pick<CampaignMember, 'line' | 'mounted' | 'wounded' | 'group' | 'status'>[];
  groups: WarSceneGroup[];
}

/** Válka na jedné mapě z pohledu jedné strany. */
export interface WarSceneView {
  campaignId: string;
  /** Takt stavu – klient se ptá `since`. */
  tick: number;
  day: number;
  /** Ze které strany se hráč dívá (mlha – scéna kreslí jen to, co poslal server). */
  side: BattleSide;
  battle: WarSceneBattle | null;
  march: WarSceneMarch | null;
}

/** Vstup: mapa, strana hráče, mřížka mapy (dohled v lese) a oči mimo boj (domy vsi obránce). */
export interface WarSceneInput {
  cell: GridCell;
  side: BattleSide;
  /** Mřížka pochodu mapy; null = dohled všude jako v lese (raději skryje víc). */
  grid: MarchGrid | null;
  /** Odkud strana vidí i bez bojovníků – u obránce domy vsi (návrh Clauda); útočník []. */
  eyes: readonly Pos[];
  /** Opevnění bojiště (jako v boji – `battleForts`) a den – výšky hradeb; [] = bez hradeb. */
  forts: readonly BattleFort[];
}

/**
 * Hradby bojiště (`BattleFort`, `crossingLayers`): po úsecích lomená čára, stojící hradba v den
 * `day` a výška valu – lezci a obránci na ochozu stojí ve správné výšce. Pořadí jako na bojišti.
 */
export function battleWallsOf(forts: readonly BattleFort[], day: number): WarSceneWall[] {
  return forts.flatMap((bf, fort) =>
    bf.shapes.flatMap((shape) => {
      const seg = bf.fort.segments.find((s) => s.index === shape.index);
      if (!seg) return [];
      const layers = crossingLayers(bf.fort, seg, day, false);
      return [
        {
          fort,
          segment: shape.index,
          path: shape.path.map(([x, z]) => ({ x, z })),
          kind: layers.wall?.kind ?? null,
          rampart: layers.rampart?.height ?? 0,
        },
      ];
    }),
  );
}

const STANDING: ReadonlySet<Fighter['state']> = new Set(['fight', 'breach', 'climb']);

/**
 * Co strana `side` vidí z tažení na mapě `cell`: vlastní strana celá, druhá jen v dohledu (`inSight`)
 * vlastních bojovníků na nohou a očí `eyes`. Útočník je vlastní stranou celé vojsko tažení (i muži
 * vazalů). Boj je jen na mapě cíle a jen běžící; pochod jen mimo boj. Nic na mapě – null.
 */
export function warSceneView(state: CampaignState, input: WarSceneInput): WarSceneView | null {
  const { side, grid } = input;
  const onTarget = sameCell(state.target.cell, input.cell);
  // po konci boje (výsledek rozhodnut) se kreslí pochod – vojsko jde dál, snímek boje by stál
  const fight = onTarget && state.battle?.outcome === 'ongoing' ? state.battle : null;
  const battle = fight ? battleView(fight, state.day, input) : null;
  const march = battle ? null : marchView(state, input);
  if (!battle && !march) return null;
  return { campaignId: state.id, tick: state.tick, day: state.day, side, battle, march };

  function marchView(s: CampaignState, inp: WarSceneInput): WarSceneMarch | null {
    const groups = s.groups.filter(
      (g) =>
        sameCell(g.cell, inp.cell) &&
        (side === 'attack' || inp.eyes.some((e) => inSight(grid, e, g.pos))),
    );
    const ids = new Set(groups.map((g) => g.id));
    const members = s.members
      .filter((m) => ids.has(m.group) && m.status === 'active')
      .map((m) => ({
        line: m.line,
        mounted: m.mounted,
        wounded: m.wounded,
        group: m.group,
        status: m.status,
      }));
    if (members.length === 0) return null;
    return {
      members,
      groups: groups.map((g) => ({
        id: g.id,
        order: g.order,
        pos: { x: g.pos.x, z: g.pos.z },
        arrived: g.arrived,
        heading: headingOf(g),
      })),
    };
  }
}

function battleView(b: BattleState, day: number, input: WarSceneInput): WarSceneBattle | null {
  const { side, grid } = input;
  const eyes = [
    ...input.eyes,
    ...b.fighters.filter((f) => f.side === side && STANDING.has(f.state)).map((f) => f.pos),
  ];
  const sees = (p: Pos): boolean => eyes.some((e) => inSight(grid, e, p));
  const shown = b.fighters.filter((f) => f.side === side || sees(f.pos));
  const ids = new Set(shown.map((f) => f.id));
  const fighters = shown.map((f): WarSceneFighter => {
    const own = f.side === side;
    return {
      id: f.id,
      side: f.side,
      group: f.group,
      line: f.line,
      bow: f.bow,
      mounted: f.mounted,
      ...(own ? { health: f.health } : {}),
      ...(f.hits ? { hits: f.hits } : {}),
      pos: { x: f.pos.x, z: f.pos.z },
      // domov cizího muže se neprozradí – raněný sedí, kde je
      home: own ? { x: f.home.x, z: f.home.z } : { x: f.pos.x, z: f.pos.z },
      state: f.state,
      cooldown: f.cooldown,
      // cíl mimo dohled se neprozradí
      aim: f.aim !== null && ids.has(f.aim) ? f.aim : null,
      killed: f.killed,
      breachAt: f.breachAt,
      ...(f.ladder ? { ladder: true } : {}),
      ...(f.onWall ? { onWall: true } : {}),
      ...(f.underground ? { underground: true as const } : {}),
      ...(f.climb ? { climb: structuredClone(f.climb) } : {}),
    };
  });
  if (fighters.length === 0) return null;
  const groupIds = new Set(fighters.map((f) => `${f.side}:${f.group}`));
  return {
    ticks: b.ticks,
    outcome: b.outcome,
    fighters,
    groups: b.groups
      .filter((g) => groupIds.has(`${g.side}:${g.id}`))
      .map((g) => ({ side: g.side, id: g.id, order: g.order, broken: g.broken })),
    // brány a hradby jsou vidět z pole (stavba, ne vojsko)
    closedGates: [...b.closedGates],
    breaches: b.breaches
      .filter((x) => side === 'attack' || sees(x.at))
      .map((x) => ({
        key: x.key,
        fort: x.fort,
        segment: x.segment,
        spot: structuredClone(x.spot),
        at: { x: x.at.x, z: x.at.z },
        method: x.method,
        phase: x.phase,
        need: { ...x.need },
        ...(x.moat ? { moat: structuredClone(x.moat) } : {}),
        progress: structuredClone(x.progress),
      })),
    ladders: (b.ladders ?? [])
      .filter((l) => side === 'attack' || sees(l.foot))
      .map((l) => ({
        ...structuredClone(l),
        climber: l.climber !== null && ids.has(l.climber) ? l.climber : null,
      })),
    walls: battleWallsOf(input.forts, day),
  };
}

/** Směr chůze skupiny – k dalšímu bodu úseku pochodu, stojí-li k cíli, jinak na sever. */
function headingOf(g: CampaignGroup): Pos {
  const next = g.leg?.points.find((p) => {
    const px = p.x - g.pos.x;
    const pz = p.z - g.pos.z;
    return px * px + pz * pz > 1;
  });
  const to = next ?? g.goal?.pos ?? { x: g.pos.x, z: g.pos.z + 1 };
  const dx = to.x - g.pos.x;
  const dz = to.z - g.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return d > 1e-9 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
}
