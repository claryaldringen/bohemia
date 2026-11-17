import { describe, expect, it } from 'vitest';
import type { Landscape, ObstacleLayer } from '../../landscape';
import type { GridCell } from '../../village/people/world-grid';
import type { RoadPoint, VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import { stepCampaign } from '../campaign';
import type { CampaignIntent, CampaignMap, CampaignState, CampaignWorld } from '../campaign-types';
import { newJourney, stepJourney } from '../journey';
import type { JourneyIntent, JourneyState } from '../journey-types';
import { marchCellCenter, MarchGridMemo, type MarchGrid, type Pos } from '../march-grid';
import { dayOfTick, msOfTick } from '../ticks';
import {
  campaign,
  flat,
  intent,
  LAUNCH,
  member,
  present,
  SUMMER,
  world as clock,
} from './campaign-fixtures';

// Uvízlý návrat (Martin 17. 11. 2026 – „Vrátit se, kudy přišla“; Úloha 8c plánu
// 2026-11-16-dense-forest). Tři mapy v řadě: domov H (0, 0), E (1, 0) a cíl E2 (2, 0). Mapu E dělí
// napříč neprůchozí pás (|z| < 20 m) na sever a jih; domov má u východního okraje neprůchozí jižní
// polovinu (x > 900 m, z < 0). Ven se jde severem E, nejkratší cesta domů z jihu E2 vede jihem E,
// odkud do domova přechod nevede – skupina se vrátí, kudy přišla.

const H: GridCell = { x: 0, y: 0 };
const E: GridCell = { x: 1, y: 0 };
const E2: GridCell = { x: 2, y: 0 };
const HOME = { villageId: 'lhota', name: 'Lhota', cell: H, pos: { x: 5, z: 5 } };
/** Cíl výjezdu na jihu mapy E2. */
const SOUTH: Pos = { x: 0, z: -500 };

const LANDS = new Map<string, Landscape>([H, E, E2].map((c) => [`${c.x},${c.y}`, flat()]));
const MAP_KEY = new Map<Landscape, string>([...LANDS].map(([k, l]) => [l, k]));

/** Je buňka se středem `p` na mapě `key` dne `day` neprůchozí? */
type Closed = (key: string, p: Pos, day: number) => boolean;

/** Ven severem E, domů jižní polovinou východního okraje domova nevede nic. */
const WALLS: Closed = (key, p) =>
  (key === '0,0' && p.x > 900 && p.z < 0) || (key === '1,0' && Math.abs(p.z) < 20);

/** Mřížky jako worker (`MarchGridMemo`), jen buňky, pro které `closed` platí, jsou neprůchozí. */
class ClosedGrids extends MarchGridMemo {
  private readonly closed: Closed;
  private readonly edited = new WeakMap<MarchGrid, MarchGrid>();

  constructor(closed: Closed) {
    super();
    this.closed = closed;
  }

  override gridOf(
    landscape: Landscape,
    obstacles: ObstacleLayer | null,
    state: VillageState | null,
    day: number,
    continuations?: readonly (readonly RoadPoint[])[],
  ): MarchGrid {
    const base = super.gridOf(landscape, obstacles, state, day, continuations);
    const key = MAP_KEY.get(landscape);
    if (key === undefined) return base;
    const known = this.edited.get(base);
    if (known) return known;
    const pace = Float32Array.from(base.pace);
    for (let c = 0; c < pace.length; c++) {
      if (this.closed(key, marchCellCenter(base, c), day)) pace[c] = 0;
    }
    const grid = { ...base, pace };
    this.edited.set(base, grid);
    return grid;
  }
}

function worldOf(closed: Closed = WALLS): CampaignWorld {
  const lhota = village([1, 2].map((id) => kin({ id, age: 30, sex: 'male' })));
  return {
    clock,
    landscapeOf: (cell): CampaignMap | null => {
      const landscape = LANDS.get(`${cell.x},${cell.y}`);
      return landscape ? { landscape, obstacles: null, villageIds: [] } : null;
    },
    villageAt: (id) => (id === 'lhota' ? lhota : null),
    villageGone: (id) => id !== 'lhota',
    grids: new ClosedGrids(closed),
  };
}

/** Výjezd vojvody s mužem na koních, rozkaz na jih mapy E2. */
function trip(): JourneyState {
  const state = newJourney(
    {
      id: 'j1',
      seed: 42,
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      recruits: [1, 2].map((personId) => ({
        ref: { villageId: 'lhota', personId },
        lord: personId === 1,
        strength: 2,
        fight: 50,
        ...(personId === 1 ? { name: 'Bořivoj' } : {}),
      })),
      startMs: msOfTick(LAUNCH, clock),
      order: { kind: 'go', pos: SOUTH, cell: E2 },
    },
    clock,
  );
  for (const m of state.members) Object.assign(m, { mounted: true, horse: 'ridden' as const });
  return state;
}

/** Rozkaz „Domů“ v taktu `tick`. */
const home = (tick: number): JourneyIntent => ({
  tick,
  seq: 1,
  byPlayer: 'p1',
  body: { kind: 'home' },
});

/** Stav, kdy skupina stojí v cíli na E2 (krok po krocích po 200 taktech). */
function atGoal(start: JourneyState, w: CampaignWorld): JourneyState {
  let s = start;
  for (let k = 0; k < 60; k++) {
    s = stepJourney(s, s.tick + 200, [], w).state;
    const g = s.groups[0]!;
    if (g.arrived && g.cell.x === E2.x) return s;
  }
  throw new Error('skupina do cíle nedošla');
}

describe('uvízlý návrat – zpět, kudy přišla (Martin 17. 11. 2026)', () => {
  it('nejkratší cesta domů uvízne – skupina se vrátí po zapamatovaných přechodech a dojde domů', () => {
    const w = worldOf();
    const there = atGoal(trip(), w);
    const g = there.groups[0]!;
    expect(g.pos).toEqual(SOUTH);
    // ven severem E: dva přechody, oba nad pásem
    expect(g.crossings!.map((c) => [c.from.x, c.to.x])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    for (const c of g.crossings!) expect(c.pos.z).toBeGreaterThan(20);
    const order = home(there.tick + 1);
    // nejkratší cesta domů vede jihem E – tam uvízne a obrátí se zpět
    let s = there;
    let retraced = false;
    for (let k = 0; k < 80 && s.phase !== 'done'; k++) {
      s = stepJourney(s, s.tick + 200, [order], w).state;
      if (s.groups[0]?.retrace) retraced = true;
    }
    expect(retraced).toBe(true);
    expect(s.phase).toBe('done');
    // vcelku a po kouscích přes JSON stejně (determinismus)
    const whole = stepJourney(there, s.tick, [order], w);
    expect(whole.state).toEqual(s);
  });

  it('zmizí-li i cesta, kudy přišla, skupina stojí a výjezd běží (žádné přenesení domů)', () => {
    // od pátého dne je zavřený celý východní okraj domova – i místo, kudy skupina vyšla
    const w = worldOf(
      (key, p, day) => WALLS(key, p, day) || (key === '0,0' && p.x > 900 && day >= SUMMER + 5),
    );
    const there = atGoal(trip(), w);
    expect(there.day).toBeGreaterThanOrEqual(SUMMER + 5);
    const end = stepJourney(there, there.tick + 8000, [home(there.tick + 1)], w).state;
    expect(end.phase).toBe('out');
    expect(end.parties[0]!.phase).toBe('returning');
    const g = end.groups[0]!;
    expect(g.retrace).toBe(true);
    expect(g.arrived).toBe(false);
    // stojí na severu E, kam se vrátila z E2 – místo přechodu do domova je zavřené
    expect(g.cell).toEqual(E);
    expect(g.pos.z).toBeGreaterThan(20);
    expect(g.pos.x).toBeGreaterThan(900);
    expect(g.crossings!.map((c) => [c.from.x, c.to.x])).toEqual([[0, 1]]);
    const later = stepJourney(end, end.tick + 400, [home(there.tick + 1)], w).state;
    expect(later.groups[0]!.pos).toEqual(g.pos);
  });

  it('uložený záznam bez paměti cesty: uvízlý návrat stojí, výjezd běží', () => {
    const w = worldOf();
    const there = atGoal(trip(), w);
    const legacy = structuredClone(there);
    delete legacy.groups[0]!.crossings;
    const end = stepJourney(legacy, legacy.tick + 4000, [home(legacy.tick + 1)], w).state;
    expect(end.phase).toBe('out');
    const g = end.groups[0]!;
    expect(g).toMatchObject({ cell: E, arrived: false });
    expect('crossings' in g).toBe(false);
    expect('retrace' in g).toBe(false);
    expect(g.pos.z).toBeLessThan(-20);
  });

  it('postavená zápisem na jih E (e2e): okraj vede jen do kapsy domova – uvízne v ní; přestavená bez dne uvíznutí dojde hned, s ním až další den', () => {
    // kapsa domova u jihu východního okraje (x > 860 m, z < −20 m) je od branky odříznutá
    const w = worldOf(
      (key, p) =>
        (key === '0,0' && p.x > 800 && p.z < 0 && (p.x < 860 || p.z > -20)) ||
        (key === '1,0' && Math.abs(p.z) < 20),
    );
    // jako e2e `placeJourney`: skupina stojí na jihu E bez paměti cesty odtud
    const start = trip();
    const spot = { x: -900, z: -300 };
    Object.assign(start.groups[0]!, {
      cell: { ...E },
      pos: { ...spot },
      goal: { cell: { ...E }, pos: { ...spot } },
      route: [],
      leg: null,
      arrived: true,
      crossings: [],
    });
    const order = home(start.tick + 1);
    const stuck = stepJourney(start, start.tick + 1200, [order], w).state;
    const g = stuck.groups[0]!;
    expect(stuck.phase).toBe('out');
    expect(g.cell).toEqual(H);
    expect(g.pos.x).toBeGreaterThan(860);
    expect(g.pos.z).toBeLessThan(-20);
    expect(g).toMatchObject({ arrived: false, retrace: true, stuckDay: stuck.day });
    // jako e2e `placeReturning`: na domovskou mapu k místu, odkud cesta k brance vede
    const placed = (clear: boolean): JourneyState => {
      const s = structuredClone(stuck);
      const q = s.groups[0]!;
      Object.assign(q, { cell: { ...H }, pos: { x: 200, z: 200 }, route: [], leg: null });
      if (clear) {
        delete q.stuckDay;
        delete q.retrace;
      }
      return s;
    };
    const walk = (from: JourneyState): JourneyState => {
      let s = from;
      for (let k = 0; k < 40 && s.phase !== 'done'; k++) {
        s = stepJourney(s, s.tick + 200, [order], w).state;
      }
      return s;
    };
    expect(walk(placed(true)).phase).toBe('done');
    // den uvíznutí zůstal: úsek z nového místa ten den nehledá (Rozhodnutí 8) – stojí do dalšího dne
    let last = stuck.tick;
    while (dayOfTick(last + 1, clock) === stuck.day) last++;
    const kept = stepJourney(placed(false), last, [order], w).state;
    expect(kept.phase).toBe('out');
    expect(kept.groups[0]!.pos).toEqual({ x: 200, z: 200 });
    const next = walk(kept);
    expect(next.phase).toBe('done');
    expect(next.day).toBeGreaterThan(stuck.day);
  });
});

describe('uvízlý návrat tažení (Martin 17. 11. 2026)', () => {
  const PRESENT = present(LAUNCH + 100, LAUNCH + 40000);

  /** Tažení z domova na jih E2 se obrátí domů, jakmile je na jihu E2 (`turn` – takt obratu). */
  function turned(w: CampaignWorld): { s: CampaignState; intents: CampaignIntent[] } {
    const members = [member(1, 0, true), member(2, 0, true)];
    const target = { villageId: 'nikde', cell: { ...E2 }, pos: { ...SOUTH } };
    const assembly = { villageId: 'lhota', cell: { ...H }, pos: { ...HOME.pos } };
    let s = campaign({ liveCommand: true, foodKg: 400, members, target, assembly });
    const out = [intent(LAUNCH + 2, 1, { kind: 'set-out' }), ...PRESENT];
    for (let k = 0; k < 120; k++) {
      s = stepCampaign(s, s.tick + 100, out, w).state;
      const g = s.groups[0]!;
      if (g.cell.x === E2.x && g.pos.z < -300) {
        return { s, intents: [...out, intent(s.tick + 1, 2, { kind: 'turn-back' })] };
      }
    }
    throw new Error('vojsko na jih E2 nedošlo');
  }

  it('nejkratší cesta uvízne – vojsko se vrátí, kudy přišlo; bez paměti stojí a tažení neskončí', () => {
    const w = worldOf();
    const { s, intents } = turned(w);
    let r = s;
    for (let k = 0; k < 120 && r.phase !== 'done'; k++) {
      r = stepCampaign(r, r.tick + 200, intents, w).state;
    }
    expect(r.phase).toBe('done');
    // bez paměti cesty: stojí na jihu E a tažení se vrací dál
    const legacy = structuredClone(s);
    for (const g of legacy.groups) delete g.crossings;
    const stuck = stepCampaign(legacy, legacy.tick + 4000, intents, w).state;
    expect(stuck.phase).toBe('returning');
    for (const g of stuck.groups) {
      expect(g).toMatchObject({ cell: E, arrived: false });
      expect(g.pos.z).toBeLessThan(-20);
    }
  });
});
