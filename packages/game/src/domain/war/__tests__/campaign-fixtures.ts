import { dayIndexOf, OFFICIAL_WORLD, realTimeOf } from '../../calendar';
import { SURFACE_CODES, type Landscape } from '../../landscape';
import type { GridCell } from '../../village/people/world-grid';
import { newCampaign, type NewCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignMember,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from '../campaign-types';

// Společné přípravky testů tažení: rovné mapy, tři muži ve dvou skupinách, cíl na sousední mapě.

const SIZE = 128;
export const world = OFFICIAL_WORLD;
export const SUMMER_DATE = { year: 501, month: 7, day: 15 };
export const SUMMER = dayIndexOf(SUMMER_DATE);
/** Takt vyslání – první celý takt letního dne. */
export const LAUNCH = Math.ceil((realTimeOf(SUMMER_DATE, world) - world.startMs) / 250);

/** Rovná louka bez překážek (jako v march.test.ts). */
export function flat(): Landscape {
  const surface = new Uint8Array(SIZE * SIZE).fill(SURFACE_CODES.meadow);
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

export const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };

/** Svět z rovných map; `known` = políčka, která už jsou načtená (ostatní null). */
export function worldOf(known: (c: GridCell) => boolean = () => true): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => (known(cell) ? MEADOW : null),
    villageAt: () => null,
  };
}

export function member(personId: number, group: number, mounted: boolean): CampaignMember {
  return {
    ref: { villageId: personId < 10 ? 'lhota' : 'brod', personId },
    playerId: 'p1',
    line: mounted,
    mounted,
    forced: false,
    strength: mounted ? 2 : 0.4,
    health: 100,
    vigor: 1,
    wounded: false,
    group,
    status: 'active',
  };
}

export function campaign(overrides: Partial<NewCampaign> = {}): CampaignState {
  return newCampaign(
    {
      id: 'c1',
      warId: 'w1',
      seed: 42,
      tick: LAUNCH,
      playerId: 'p1',
      leaderName: 'Bořivoj',
      commander: { villageId: 'lhota', personId: 1 },
      deputy: null,
      assembly: { villageId: 'lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
      target: { villageId: 'knezice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
      members: [member(1, 0, true), member(2, 1, false), member(11, 1, false)],
      foodKg: 20,
      liveCommand: true,
      ...overrides,
    },
    world,
  );
}

export function intent(
  tick: number,
  seq: number,
  body: IntentBody,
  byPlayer = 'p1',
): CampaignIntent {
  return { tick, seq, byPlayer, body };
}

export const SET_OUT = [intent(LAUNCH + 2, 1, { kind: 'set-out' })];

/**
 * Hráč u tažení (živé vedení – war.md, Velení): záměr `presence` každých `every` taktů od `from`
 * do `to`; bez přítomnosti se výprava po 1 herním dni předá zástupci, nebo rozpadne.
 */
export function present(from: number, to: number, every = 100): CampaignIntent[] {
  const out: CampaignIntent[] = [];
  for (let tick = from; tick <= to; tick += every) out.push(intent(tick, 1, { kind: 'presence' }));
  return out;
}

/** Vyslání a hráč u tažení po celou dobu testu. */
export const LIVE = [...SET_OUT, ...present(LAUNCH + 100, LAUNCH + 5000)];
