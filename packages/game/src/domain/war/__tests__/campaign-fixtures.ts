import { dayIndexOf, OFFICIAL_WORLD, realTimeOf } from '../../calendar';
import { SURFACE_CODES, type Landscape } from '../../landscape';
import type { NewVillageEvent } from '../../village/core/inbox';
import type { GridCell } from '../../village/people/world-grid';
import { newCampaign, stepCampaign, type NewCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignMember,
  CampaignNotice,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from '../campaign-types';
import { MarchGridMemo } from '../march-grid';

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
    // mřížky napříč voláními jako worker – kroky po kouscích by jemnou mřížku stavěly znovu
    grids: new MarchGridMemo(),
  };
}

/** Výsledek kroků po kouscích – stav na konci a události a upozornění všech kousků. */
export interface ChunkedRun {
  state: CampaignState;
  villageEvents: NewVillageEvent[];
  notices: CampaignNotice[];
}

/**
 * Krokuje tažení po `chunk` taktech do taktu `end` (`json` – přes JSON mezi kousky jako bod uložený
 * v DB, výchozí ano); s `until` jen dokud podmínka nenastane. Pojistka proti visícím testům
 * (jeden běh visel 7 h): skončené tažení `stepCampaign` neposouvá, smyčka `while (s.tick < end)`
 * by se pak točila navždy – krok bez posunu, krok čekající na data a `until`, které do `end`
 * nenastane, proto hodí chybu.
 */
export function stepInChunks(
  start: CampaignState,
  end: number,
  o: {
    chunk: number;
    world: CampaignWorld;
    intents?: readonly CampaignIntent[];
    until?: (s: CampaignState) => boolean;
    json?: boolean;
  },
): ChunkedRun {
  const run: ChunkedRun = { state: start, villageEvents: [], notices: [] };
  while (o.until ? !o.until(run.state) : run.state.tick < end) {
    const from = run.state.tick;
    if (from >= end) throw new Error(`podmínka nenastala do taktu ${end}`);
    const next = stepCampaign(run.state, Math.min(end, from + o.chunk), o.intents ?? [], o.world);
    if (next.waiting !== null) throw new Error(`krok v taktu ${from} čeká na data`);
    if (next.state.tick <= from) {
      throw new Error(
        `tažení skončilo v taktu ${from} (fáze ${next.state.phase}) před taktem ${end}`,
      );
    }
    run.villageEvents.push(...next.villageEvents);
    run.notices.push(...next.notices);
    run.state =
      o.json === false ? next.state : (JSON.parse(JSON.stringify(next.state)) as CampaignState);
  }
  return run;
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
