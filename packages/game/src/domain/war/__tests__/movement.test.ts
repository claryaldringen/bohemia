import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../village/people/world-grid';
import { cellKey, tickContext, type TickContext } from '../campaign-tick';
import type { CampaignGroup, CampaignWorld } from '../campaign-types';
import { marchCellAt, marchCellCenter, marchGrid, type MarchGrid, type Pos } from '../march-grid';
import { sendGroup, stepMover, type Mover, type MoverStep } from '../movement';
import { flat, SUMMER, world, worldOf } from './campaign-fixtures';

// Pohyb po mapách (plán 2026-11-16-dense-forest – Rozhodnutí 8, Review Focus 3 a 4): okrajem jen
// tam, kde je protějšek na sousední mapě průchozí; uvízlá skupina ten den znovu neplánuje.

const HOME: GridCell = { x: 0, y: 0 };
const EAST: GridCell = { x: 1, y: 0 };
/** Cíl na východní mapě. */
const GOAL: Pos = { x: -800, z: 110 };

/**
 * Mřížka rovné mapy dne `SUMMER`, jejíž západní pás 60 m (střed buňky x < −900) je neprůchozí
 * kromě buněk se středem z, pro které `open(z)`.
 */
function closedWest(open: (z: number) => boolean): MarchGrid {
  const grid = marchGrid(flat(), null, null, { day: SUMMER });
  const pace = Float32Array.from(grid.pace);
  for (let c = 0; c < pace.length; c++) {
    const p = marchCellCenter(grid, c);
    if (p.x < -900 && !open(p.z)) pace[c] = 0;
  }
  return { ...grid, pace };
}

/** Kontext taktu nad rovnými mapami; mřížka východní mapy dne `day` je `east` (jinak louka). */
function ctxWith(east: MarchGrid | null, day = SUMMER, w: CampaignWorld = worldOf()): TickContext {
  const ctx = tickContext(w);
  if (east) ctx.grids.set(`${cellKey(EAST)}@${day}`, east);
  return ctx;
}

/** Skupina 60 m od východního okraje domovské mapy, jde na východní mapu. */
function mover(): Mover {
  return { cell: { ...HOME }, pos: { x: 900, z: 0 }, route: [{ ...EAST }], leg: null };
}

describe('přechod okraje (Rozhodnutí 8)', () => {
  it('přejde jen tam, kde je protějšek na sousední mapě průchozí (Review Focus 4)', () => {
    const east = closedWest((z) => z >= 100 && z <= 120);
    const ctx = ctxWith(east);
    const m = mover();
    let step = stepMover(m, GOAL, 5, SUMMER, ctx);
    for (let k = 0; k < 400 && step === 'moved'; k++) step = stepMover(m, GOAL, 5, SUMMER, ctx);
    expect(step).toBe('crossed');
    expect(m.cell).toEqual(EAST);
    expect(m.pos.x).toBeCloseTo(-958.75, 6);
    expect(m.pos.z).toBeGreaterThanOrEqual(100);
    expect(m.pos.z).toBeLessThanOrEqual(120);
    expect(east.pace[marchCellAt(east, m.pos)]!).toBeGreaterThan(0);
  });

  it('nepřejde do kapsy u okraje sousední mapy, když vede přechod k cíli (Vlkov E)', () => {
    // u z = 0 je pás otevřený jen do 30 m od okraje (kapsa), průchod dál je v z ∈ [100; 120]
    const east = closedWest((z) => z >= 100 && z <= 120);
    const pace = Float32Array.from(east.pace);
    for (let c = 0; c < pace.length; c++) {
      const p = marchCellCenter(east, c);
      if (p.x < -930 && Math.abs(p.z) <= 10) pace[c] = 1;
    }
    const pocketed = { ...east, pace };
    const ctx = ctxWith(pocketed);
    const m = mover();
    let step = stepMover(m, GOAL, 5, SUMMER, ctx);
    for (let k = 0; k < 400 && step === 'moved'; k++) step = stepMover(m, GOAL, 5, SUMMER, ctx);
    expect(step).toBe('crossed');
    expect(m.pos.z).toBeGreaterThanOrEqual(100);
    expect(m.pos.z).toBeLessThanOrEqual(120);
    for (let k = 0; k < 400 && step !== 'arrived' && step !== 'stuck'; k++) {
      step = stepMover(m, GOAL, 5, SUMMER, ctx);
    }
    expect(step).toBe('arrived');
    expect(m.pos).toEqual(GOAL);
    // bez přechodu k cíli vezme kapsu – lepší než stát u okraje (cíl se pak posune)
    const only = closedWest(() => false);
    for (let c = 0; c < only.pace.length; c++) {
      const p = marchCellCenter(only, c);
      if (p.x < -930 && Math.abs(p.z) <= 10) only.pace[c] = 1;
    }
    const onlyCtx = ctxWith(only);
    const n = mover();
    let s = stepMover(n, GOAL, 5, SUMMER, onlyCtx);
    for (let k = 0; k < 400 && s === 'moved'; k++) s = stepMover(n, GOAL, 5, SUMMER, onlyCtx);
    expect(s).toBe('crossed');
    expect(Math.abs(n.pos.z)).toBeLessThanOrEqual(10);
  });

  it('okraj bez přechodu: stojí, ten den mapu nečte, druhý den plánuje znovu (Review Focus 3)', () => {
    const m = mover();
    expect(stepMover(m, GOAL, 5, SUMMER, ctxWith(closedWest(() => false)))).toBe('stuck');
    expect(m.stuckDay).toBe(SUMMER);
    expect(m.leg).toBeNull();
    // týž den: svět, který při čtení mapy hodí – uvízlá skupina ho nečte
    const broken: CampaignWorld = {
      clock: world,
      landscapeOf: () => {
        throw new Error('mapa se číst nemá');
      },
      villageAt: () => {
        throw new Error('ves se číst nemá');
      },
    };
    expect(stepMover(m, GOAL, 5, SUMMER, tickContext(broken))).toBe('stuck');
    expect(m.cell).toEqual(HOME);
    // druhý den plánuje znovu – okraj je už průchozí
    expect(stepMover(m, GOAL, 5, SUMMER + 1, ctxWith(null, SUMMER + 1))).toBe('moved');
    expect(m.leg).not.toBeNull();
    expect('stuckDay' in m).toBe(false);
  });

  it('nový rozkaz (`sendGroup`) uvíznutí smaže', () => {
    const g: CampaignGroup = {
      id: 0,
      order: 'follow-leader',
      cell: { ...HOME },
      pos: { x: 900, z: 0 },
      goal: { cell: { ...EAST }, pos: GOAL },
      route: [{ ...EAST }],
      leg: null,
      arrived: true,
      stuckDay: SUMMER,
    };
    sendGroup(g, { cell: { ...HOME }, pos: { x: 0, z: 0 } });
    expect('stuckDay' in g).toBe(false);
    expect(g.arrived).toBe(false);
  });
});

describe('úhlopříčný soused dvěma kolmými kroky (oprava Úlohy 5 – čtyřsousedná cesta)', () => {
  const NORTH: GridCell = { x: 0, y: 1 };
  const NE: GridCell = { x: 1, y: 1 };
  const TARGET = { cell: NE, pos: { x: -800, z: -800 } };

  /** Mřížka rovné mapy dne `SUMMER`; buňky se středem, pro který `blocked`, jsou neprůchozí. */
  function closed(blocked: (p: Pos) => boolean): MarchGrid {
    const grid = marchGrid(flat(), null, null, { day: SUMMER });
    const pace = Float32Array.from(grid.pace);
    for (let c = 0; c < pace.length; c++) if (blocked(marchCellCenter(grid, c))) pace[c] = 0;
    return { ...grid, pace };
  }

  /** Skupina uprostřed domovské mapy vyslaná k cíli na úhlopříčné sousední mapě. */
  function sent(home: MarchGrid): { g: CampaignGroup; ctx: TickContext } {
    const ctx = tickContext(worldOf());
    ctx.grids.set(`${cellKey(HOME)}@${SUMMER}`, home);
    const g: CampaignGroup = {
      id: 0,
      order: 'follow-leader',
      cell: { ...HOME },
      pos: { x: 0, z: 0 },
      goal: null,
      route: [],
      leg: null,
      arrived: true,
    };
    sendGroup(g, TARGET);
    return { g, ctx };
  }

  /** Kroky po 50 m louky do dojití nebo uvíznutí; mapy, na které skupina přešla. */
  function walk(g: CampaignGroup, ctx: TickContext): { step: MoverStep; maps: string[] } {
    const maps: string[] = [];
    let step: MoverStep = 'moved';
    for (let k = 0; k < 400 && step !== 'arrived' && step !== 'stuck'; k++) {
      step = stepMover(g, g.goal!.pos, 50, SUMMER, ctx);
      if (step === 'crossed') maps.push(cellKey(g.cell));
    }
    return { step, maps };
  }

  it('cíl na úhlopříčné mapě – přes severní mapu, i když je roh mapy zavřený', () => {
    // roh 60 × 60 m u severovýchodního rohu domovské mapy je neprůchozí (dřív jediná rohová buňka)
    const { g, ctx } = sent(closed((p) => p.x > 900 && p.z > 900));
    expect(g.route).toEqual([NORTH, NE]);
    const { step, maps } = walk(g, ctx);
    expect(step).toBe('arrived');
    expect(maps).toEqual([cellKey(NORTH), cellKey(NE)]);
    expect(g.pos).toEqual(TARGET.pos);
  });

  it('zavřený okraj prvního kroku: stojí, objížďku přes východní mapu nehledá', () => {
    // Martin 16. 11. 2026: „Má zůstat stát.“ – celý severní pás domovské mapy je neprůchozí
    const { g, ctx } = sent(closed((p) => p.z > 900));
    const { step, maps } = walk(g, ctx);
    expect(step).toBe('stuck');
    expect(maps).toEqual([]);
    expect(g.cell).toEqual(HOME);
  });
});
