import { OFFICIAL_WORLD } from '../../calendar';
import { SURFACE_CODES, type Landscape } from '../../landscape';
import { addGate, fortificationArea, fortificationOutline, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import type { TileCell } from '../../village/types';
import { village } from '../../village/__tests__/kin-fixtures';
import {
  battleForts,
  battleTick,
  openBattle,
  type BattleAttacker,
  type BattleField,
  type BattleState,
} from '../battle';
import type { GroupOrder } from '../campaign-types';
import type { Defender } from '../defenders';
import type { Pos } from '../march-grid';
import { marchGrid } from '../march-grid';
import { hoursPerTick, tickRandom } from '../ticks';

// Přípravky testů boje: rovná louka 1920 × 1920 m (volitelně les), palisáda kolem středu
// (svět −30…30 m, brána na jihu v z = −30), útočníci a obránci.

const SIZE = 128;
export const DAY = 10;

/** Rovná louka; `forest` = políčka hustého lesa. */
export function land(forest: (tx: number, ty: number) => boolean = () => false): Landscape {
  const surface = new Uint8Array(SIZE * SIZE);
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      surface[ty * SIZE + tx] = forest(tx, ty) ? SURFACE_CODES.forest : SURFACE_CODES.meadow;
    }
  }
  return {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface,
    fertility: new Uint8Array(SIZE * SIZE),
    villageSite: { x: 64, y: 64 },
    stream: [],
    obstacleLayer: null,
  };
}

/** Palisáda 4 × 4 políčka kolem středu, hotová ve dni 0; volitelně brána na jihu. */
export function palisade(gate: boolean): Fortification {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: SIZE, cellSizeM: 15 });
  if ('error' in area) throw new Error(area.error);
  const outline = fortificationOutline(area, 'palisade');
  const gates = gate ? addGate(outline, [], { x: 0, z: -30 }) : [];
  if (!Array.isArray(gates)) throw new Error(gates.error);
  return {
    id: 1,
    grid: null,
    cells,
    kind: 'palisade',
    segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
    gates,
  };
}

/** Bojiště na louce s opevněním `forts`. */
export function field(
  forts: Fortification[] = [],
  forest?: (tx: number, ty: number) => boolean,
): BattleField {
  const landscape = land(forest);
  const v = village([], [], { fortifications: forts, lastDay: DAY });
  return {
    grid: marchGrid(landscape, null, v, { day: DAY }),
    geo: landscape,
    forts: battleForts(landscape, forts),
    day: DAY,
    hoursPerTick: hoursPerTick(OFFICIAL_WORLD),
  };
}

/** Pěší vesničan tažení (síla 0,4), skupina 0. */
export function attacker(
  member: number,
  pos: Pos,
  o: Partial<BattleAttacker> = {},
): BattleAttacker {
  return { member, group: 0, line: false, mounted: false, strength: 0.4, health: 100, pos, ...o };
}

/** Muž vsi 16–44 let (síla 0,4) u domu `pos`, skupina domů 0. */
export function defender(personId: number, pos: Pos, o: Partial<Defender> = {}): Defender {
  return {
    personId,
    pos,
    houseGroup: 0,
    strength: 0.4,
    line: false,
    bow: false,
    atHouseOnly: false,
    lastLine: false,
    ...o,
  };
}

/** Boj; rozkazy skupin (výchozí „útočit na vše“), velitel podle `commander`. */
export function battle(input: {
  attackers: BattleAttacker[];
  defenders: Defender[];
  orders?: Record<number, GroupOrder>;
  holdAt?: Record<number, Pos>;
  commander?: number | null;
  live?: boolean;
}): BattleState {
  const ids = [...new Set(input.attackers.map((a) => a.group))];
  return openBattle({
    attackers: input.attackers,
    defenders: input.defenders,
    groups: ids.map((id) => ({
      id,
      order: input.orders?.[id] ?? 'attack-all',
      holdAt: input.holdAt?.[id] ?? null,
    })),
    commander: input.commander ?? null,
    deputy: null,
    liveCommand: input.live ?? false,
  });
}

/** Takty boje `from + 1 … from + ticks`; `each` po každém (číslo taktu). Do konce boje. */
export function run(
  b: BattleState,
  f: BattleField,
  ticks: number,
  each: (tick: number) => void = () => {},
  seed = 7,
): void {
  for (let t = 1; t <= ticks && b.outcome === 'ongoing'; t++) {
    battleTick(b, f, tickRandom(seed, t, 'battle'));
    each(t);
  }
}

/** Bojovník podle id. */
export function fighter(b: BattleState, id: string): BattleState['fighters'][number] {
  const f = b.fighters.find((x) => x.id === id);
  if (!f) throw new Error(`Bojovník ${id} chybí`);
  return f;
}
