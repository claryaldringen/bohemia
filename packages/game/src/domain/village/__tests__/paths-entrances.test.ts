import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { CEMETERY_FENCE_INSET_M as INSET, PEN_FENCE_INSET_M } from '../rules';
import {
  CEMETERY_GATE,
  PEN_GATE,
  SACRED_ENTRANCE_M,
  WOVEN_FENCE_CORNER_M,
  cemeteryEntrance,
  penEntrance,
  penEntranceFacing,
  sacredEntrance,
  type Entrance,
} from '../paths/entrances';
import { computePathNetwork, type PathNetwork, type PathVillage } from '../paths/network';
import { pathVillageOf, walkLayoutKey } from '../paths/village';
import { advanceVillage } from '../simulate';
import { rotationCosSin, turnRotation } from '../square-grid';
import type { Person, VillageState } from '../types';
import { LANDSCAPE, house, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vchody staveb (paths.md – Vchody; Martin, 19. 10. 2026: „A ještě, každá budova by měla mít
// nějaký vchod, od kterého cesta povede.“).

const terrain = pathTestTerrain();
const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const YEAR = 365.25;

/** Čtverec 15 m v mřížce s počátkem v (ox, oz) – natočení `turn` po 15°. */
function square(
  i: number,
  j: number,
  turn = 0,
  ox = 37.5,
  oz = 37.5,
): { cell: { x: number; y: number }; x: number; z: number; size: number; rotation?: number } {
  if (turn === 0) return { cell: { x: i, y: j }, x: ox + i * 15, z: oz + j * 15, size: 15 };
  const rotation = turnRotation(turn);
  const [c, s] = rotationCosSin(rotation);
  const lx = i * 15;
  const lz = j * 15;
  return {
    cell: { x: i, y: j },
    x: ox + lx * c + lz * s,
    z: oz - lx * s + lz * c,
    size: 15,
    rotation,
  };
}

const built = (x: number, z: number): { position: { x: number; z: number }; built: boolean } => ({
  position: { x, z },
  built: true,
});

/** Jak blízko bodu kus před vchodem vede pěšina (m). */
function pathNear(network: PathNetwork, e: Entrance): number {
  const at = { x: e.x + e.outX * 1.5, z: e.z + e.outZ * 1.5 };
  return Math.min(
    ...network.lines.flatMap((l) => l.points.map((p) => Math.hypot(p.x - at.x, p.z - at.z))),
  );
}

describe('branka hřbitova (cemeteryEntrance)', () => {
  it('na rovném úseku plotu nejblíž k nejbližšímu hotovému obydlí, směr ven', () => {
    // dva čtverce x 30–60, z 30–45; dům na jihu
    const squares = [square(0, 0), square(1, 0)];
    const gate = cemeteryEntrance({ squares, built: true }, [built(45, -40), built(200, 200)])!;
    // plot stojí 1,5 m uvnitř čtverce
    expect(gate).toEqual({ x: 45, z: 30 + INSET, outX: 0, outZ: -1 });
    // rozestavěné obydlí branku neposune
    const site = { position: { x: 45, z: 100 }, built: false };
    expect(cemeteryEntrance({ squares, built: true }, [site, built(45, -40)])).toEqual(gate);
    // bez hotového obydlí žádná
    expect(cemeteryEntrance({ squares, built: true }, [site])).toBeNull();
  });

  it('branka se drží kus od zakulaceného rohu (kůl vedle branky)', () => {
    const squares = [square(0, 0)];
    const gate = cemeteryEntrance({ squares }, [built(-100, 37.5)])!;
    // obydlí daleko na západě v ose čtverce – západní strana, uprostřed
    expect(gate).toEqual({ x: 30 + INSET, z: 37.5, outX: -1, outZ: 0 });
    // obydlí šikmo za rohem – branka na kraji rovného úseku
    const corner = cemeteryEntrance({ squares }, [built(0, -20)])!;
    const margin = CEMETERY_GATE.gateWidth / 2 + CEMETERY_GATE.postStep;
    const min = 30 + INSET + WOVEN_FENCE_CORNER_M.outer + margin;
    expect(corner.outX === -1 ? corner.z : corner.x).toBeCloseTo(min, 9);
  });

  it('rozšíření ve stavbě: branka na plotu hotových čtverců; zakládaný hřbitov – všech', () => {
    const ready = square(0, 0);
    const pending = { ...square(0, -1), pending: true };
    const dwellings = [built(37.5, -60)];
    const gate = cemeteryEntrance({ squares: [ready, pending], built: true }, dwellings)!;
    // jižní strana hotového čtverce (z = 30), rozšíření na jih ještě ohrazené není
    expect(gate.z).toBe(30 + INSET);
    const founding = cemeteryEntrance(
      { squares: [ready, { ...pending }].map((q) => ({ ...q, pending: true })), built: false },
      dwellings,
    )!;
    expect(founding.z).toBe(15 + INSET);
  });

  it('tvar L a čtverce jen rohem – vnitřní roh má menší oblouk', () => {
    // L: (0,0), (1,0), (0,1) – vnitřní roh v (45, 45), obydlí v zákoutí u něj
    const ell = [square(0, 0), square(1, 0), square(0, 1)];
    const gate = cemeteryEntrance({ squares: ell }, [built(46, 46.5)])!;
    // pravá strana čtverce (0,1): branka kůl od malého oblouku vnitřního rohu
    const margin = CEMETERY_GATE.gateWidth / 2 + CEMETERY_GATE.postStep;
    expect(gate.x).toBe(45 - INSET);
    // nejméně kůl od malého oblouku (plot je odsazený, takže úsek začíná o 1,5 m dřív)
    expect(gate.z).toBeGreaterThanOrEqual(45 - INSET + WOVEN_FENCE_CORNER_M.inner + margin - 1e-9);
    expect(gate.outX).toBe(1);
    const diagonal = cemeteryEntrance({ squares: [square(0, 0), square(1, 1)] }, [built(0, 0)])!;
    expect(diagonal.outX + diagonal.outZ).toBeLessThan(0);
  });

  it('natočený hřbitov: branka na plotu v osách mřížky, deterministicky', () => {
    for (const turn of [1, 6, 7]) {
      const squares = [square(0, 0, turn), square(1, 0, turn)];
      const gate = cemeteryEntrance({ squares }, [built(-50, -50)])!;
      // leží na obrysu: v rovném prostoru je jedna souřadnice na okraji čtverce
      const [c, s] = rotationCosSin(squares[0]!.rotation!);
      const dx = gate.x - squares[0]!.x;
      const dz = gate.z - squares[0]!.z;
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      // obrys dvou čtverců v rovném prostoru odsazený plotem: u od −7,5 + I do 22,5 − I, v ±(7,5 − I)
      const onEdge =
        Math.abs(Math.abs(v) - (7.5 - INSET)) < 1e-9 ||
        Math.abs(u + 7.5 - INSET) < 1e-9 ||
        Math.abs(u - 22.5 + INSET) < 1e-9;
      expect(onEdge, `natočení ${turn}`).toBe(true);
      expect(Math.hypot(gate.outX, gate.outZ)).toBeCloseTo(1, 12);
      expect(cemeteryEntrance({ squares }, [built(-50, -50)])).toEqual(gate);
    }
  });
});

describe('branka ohrady (penEntrance)', () => {
  const pen = { x: 37.5, z: -22.5, size: 15 };
  const half = pen.size / 2 - PEN_FENCE_INSET_M;

  it('na straně k obydlí, posunutá k němu, nejvýš kůl od zakulaceného rohu', () => {
    expect(penEntrance(pen, { x: 0, z: 1 })).toEqual({
      x: 37.5,
      z: -22.5 + half,
      outX: 0,
      outZ: 1,
    });
    expect(penEntrance(pen, { x: -1, z: 0 })).toEqual({
      x: 37.5 - half,
      z: -22.5,
      outX: -1,
      outZ: 0,
    });
    const aside = penEntrance(pen, { x: 1, z: 0.4 });
    expect(aside.x).toBe(37.5 + half);
    expect(aside.z).toBeGreaterThan(-22.5 + 1);
    const limit = half - WOVEN_FENCE_CORNER_M.outer - PEN_GATE.gateWidth / 2 - PEN_GATE.postStep;
    expect(penEntrance(pen, { x: 1, z: 0.99 }).z).toBeCloseTo(-22.5 + limit, 9);
  });

  it('cíl: nejbližší obydlí (i rozestavěné), bez obydlí dolů', () => {
    expect(penEntranceFacing(pen, [])).toEqual({ x: 0, z: -1 });
    expect(
      penEntranceFacing(pen, [{ position: { x: 100, z: 0 } }, { position: { x: 37.5, z: 10 } }]),
    ).toEqual({ x: 0, z: 32.5 });
  });

  it('natočená ohrada: branka v osách čtverce', () => {
    const rotation = turnRotation(3);
    const gate = penEntrance({ ...pen, rotation }, { x: 0, z: 1 });
    const [c, s] = rotationCosSin(rotation);
    const dx = gate.x - pen.x;
    const dz = gate.z - pen.z;
    const u = dx * c - dz * s;
    const v = dx * s + dz * c;
    expect(Math.max(Math.abs(u), Math.abs(v))).toBeCloseTo(half, 9);
  });
});

describe('vstup do modly a svatyně (sacredEntrance)', () => {
  it('na předku stavby (+z modelu)', () => {
    const idol = sacredEntrance({ kind: 'idol', position: { x: 10, z: 20, rotation: 0 } });
    expect(idol.x).toBeCloseTo(10, 9);
    expect(idol.z).toBeCloseTo(20 + SACRED_ENTRANCE_M.idol, 9);
    const shrine = sacredEntrance({
      kind: 'shrine',
      position: { x: 10, z: 20, rotation: Math.PI / 2 },
    });
    expect(shrine.x).toBeCloseTo(10 + SACRED_ENTRANCE_M.shrine, 9);
    expect(shrine.z).toBeCloseTo(20, 9);
    expect(shrine.outX).toBeCloseTo(1, 9);
  });
});

describe('síť pěšin vede k vchodu (Martin)', () => {
  const people = { children: 4, adults: 8, elders: 2 };
  const village = (extra: Partial<PathVillage>): PathVillage => ({
    dwellings: [house(1, 0, 0), house(2, 14, 4), house(3, -13, 5)],
    fields: [],
    labor: { day: 4000, month: 6, people, shares: [] },
    ...extra,
  });

  it('k hotovému hřbitovu brankou, ne kdekoli u plotu', () => {
    // hřbitov za vsí na severovýchodě – branka na jižní straně k nejbližšímu domu
    const cemeteries = [{ id: 4, squares: [square(0, 0), square(1, 0)], built: true }];
    const v = village({ cemeteries });
    const gate = cemeteryEntrance(cemeteries[0]!, v.dwellings)!;
    const network = computePathNetwork({ village: v, terrain });
    // brána stojí 1,5 m uvnitř čtverce, buňky sítě jsou 3,75 m
    expect(pathNear(network, gate)).toBeLessThan(4);
    expect(computePathNetwork({ village: v, terrain }).lines).toEqual(network.lines);
    expect(network.visits.get('cemetery:4')).toBeGreaterThan(0);
  });

  it('k hotové ohradě brankou, dovnitř přes plot ne', () => {
    const pen = { ...square(0, 0, 0, 52.5, -37.5), id: 6, built: true };
    const v = village({
      pens: [pen],
      labor: {
        day: 4000,
        month: 1,
        people,
        shares: [{ target: { kind: 'pen', id: 6 }, manDays: 3 }],
      },
    });
    const gate = penEntrance(pen, penEntranceFacing(pen, v.dwellings));
    const network = computePathNetwork({ village: v, terrain });
    expect(pathNear(network, gate)).toBeLessThan(3);
    // vnitřek ohrady – za plotem se nechodí
    const inside = network.lines.flatMap((l) =>
      l.points.filter((p) => Math.abs(p.x - pen.x) < 5 && Math.abs(p.z - pen.z) < 5),
    );
    expect(inside).toEqual([]);
  });

  it('k modle a svatyni vstupem na předku', () => {
    const sacred = {
      oaks: [],
      groves: [],
      buildings: [
        {
          id: 7,
          kind: 'idol' as const,
          position: { x: -40, z: -50, rotation: Math.PI },
          built: true,
        },
        {
          id: 8,
          kind: 'shrine' as const,
          position: { x: 60, z: 10, rotation: -Math.PI / 2 },
          built: true,
        },
      ],
    };
    const network = computePathNetwork({ village: village({ sacred }), terrain });
    for (const b of sacred.buildings) {
      expect(pathNear(network, sacredEntrance(b)), b.kind).toBeLessThan(3);
    }
  });
});

describe('vchody ve stavu vsi', () => {
  /** Ves s obydlím v (−60, −40), hotovým hřbitovem a ohradou na louce. */
  function withBuildings(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -60, z: -40, rotation: 0 } }),
    );
    s.people = [25, 25, 22, 21].map((years, k): Person => ({
      id: 2 + k,
      bornDay: DAY - Math.ceil(years * YEAR),
      dwellingId: 1,
    }));
    s.constructions = [];
    s.storesKg = 4000;
    s.dwellings[0]!.builtDay = DAY - 20 * 365;
    const cell = (x: number, y: number): { x: number; z: number } => ({
      x: -142.5 + x * 15,
      z: -142.5 + y * 15,
    });
    s.cemeteries = [
      {
        id: 50,
        squares: [{ cell: { x: 4, y: 9 }, ...cell(4, 9), waterDistanceM: 80 }],
        squareSizeM: 15,
        graves: 3,
        builtDay: DAY - 400,
      },
    ];
    s.pens = [
      {
        id: 51,
        cell: { x: 6, y: 4 },
        ...cell(6, 4),
        builtDay: DAY - 400,
        team: null,
        training: null,
      },
    ];
    s.nextId = 100;
    return s;
  }

  it('ves pro pěšiny nese hotový hřbitov a rozšíření; klíč hotového hřbitova se nemění', () => {
    const s = withBuildings();
    const v = pathVillageOf(s, DAY, LANDSCAPE);
    expect(v.cemeteries?.[0]?.built).toBe(true);
    expect(v.cemeteries?.[0]?.squares.some((q) => q.pending)).toBe(false);
    const key = walkLayoutKey(s, DAY);
    expect(key).toContain('"50:4,9"');
    const extended = structuredClone(s);
    extended.cemeteries![0]!.squares.push({
      cell: { x: 4, y: 10 },
      ...{ x: -142.5 + 4 * 15, z: -142.5 + 10 * 15 },
      waterDistanceM: 80,
      constructionId: 99,
    });
    expect(walkLayoutKey(extended, DAY)).toContain('"50:4,9;4,10p"');
    expect(pathVillageOf(extended, DAY, LANDSCAPE).cemeteries?.[0]?.squares[1]?.pending).toBe(true);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (hřbitov a ohrada)', () => {
    const start = withBuildings();
    const end = DAY + 120;
    const whole = advanceVillage(start, end, null, LANDSCAPE);
    const viaJson = (v: VillageState): VillageState =>
      JSON.parse(JSON.stringify(v)) as VillageState;
    const steps = [1, 3, 30, 7, 50, 2];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          null,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(viaJson(whole));
  }, 60_000);
});
