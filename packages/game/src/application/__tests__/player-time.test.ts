import { describe, expect, it } from 'vitest';
import { dayIndexOf, TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import {
  DEV_MODE_ONLY,
  playerDay,
  playerTime,
  skipTime,
  WORLD_END_REACHED,
  type SkipTimeInput,
} from '../player-time';
import type { LandscapeSource } from '../settlements';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';

const WORLD_DAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const LAST_DAY = TOTAL_GAME_DAYS - 1;
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };

/** Hráč se sídlem a vsí založenou dnes (den světa). */
async function player(): Promise<{
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
  offsets: InMemoryTimeOffsets;
  settlementId: string;
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: seat.id,
      landscape,
      today: WORLD_DAY,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
      fieldCells: block(6, 6, 4, 4),
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return {
    settlements,
    villages,
    offsets: new InMemoryTimeOffsets(),
    settlementId: seat.id,
    villageId: founded.village.id,
  };
}

const skip = (overrides: Partial<SkipTimeInput> = {}): SkipTimeInput => ({
  playerId: PLAYER,
  worldDay: WORLD_DAY,
  devMode: true,
  skip: 'month',
  ...overrides,
});

describe('playerDay a playerTime – dnešní den hráče', () => {
  it('je den světa + posun, nejvýš poslední den světa', () => {
    expect(playerDay(WORLD_DAY, 0)).toBe(WORLD_DAY);
    expect(playerDay(WORLD_DAY, 365)).toBe(WORLD_DAY + 365);
    expect(playerDay(LAST_DAY - 10, 30)).toBe(LAST_DAY);
  });

  it('hráč bez posunu žije v dni světa, s posunem o posun dál', async () => {
    const offsets = new InMemoryTimeOffsets();
    const input = { playerId: PLAYER, worldDay: WORLD_DAY };
    expect(await playerTime({ offsets }, input)).toEqual({ today: WORLD_DAY, offsetDays: 0 });
    offsets.offsets.set(PLAYER, 395);
    expect(await playerTime({ offsets }, input)).toEqual({
      today: WORLD_DAY + 395,
      offsetDays: 395,
    });
  });
});

describe('skipTime', () => {
  it('bez vývojového režimu odmítne a nic nezmění', async () => {
    const { settlements, villages, offsets, villageId } = await player();
    const result = await skipTime(
      { settlements, villages, offsets, landscapes },
      skip({ devMode: false }),
    );
    expect(result).toEqual({ ok: false, reason: DEV_MODE_ONLY });
    expect(offsets.offsets.size).toBe(0);
    expect(villages.records.get(villageId)?.state.lastDay).toBe(WORLD_DAY);
  });

  it('o měsíc posune den hráče o 30 dní a dopočítá ves do nového dneška', async () => {
    const { settlements, villages, offsets, villageId } = await player();
    const result = await skipTime({ settlements, villages, offsets, landscapes }, skip());
    expect(result).toEqual({ ok: true, today: WORLD_DAY + 30, offsetDays: 30 });
    expect(await offsets.offsetOf(PLAYER)).toBe(30);
    expect(villages.records.get(villageId)?.state.lastDay).toBe(WORLD_DAY + 30);
  });

  it('o rok posune o 365 dní – posuny se sčítají a ves se dopočítá', async () => {
    const { settlements, villages, offsets, villageId } = await player();
    const deps = { settlements, villages, offsets, landscapes };
    await skipTime(deps, skip());
    const result = await skipTime(deps, skip({ skip: 'year' }));
    expect(result).toEqual({ ok: true, today: WORLD_DAY + 395, offsetDays: 395 });
    const village = villages.records.get(villageId);
    expect(village?.state.lastDay).toBe(WORLD_DAY + 395);
    // ves za rok žije dál – zakladatelé si mezitím zemnici dostavěli
    expect(village?.state.people.length).toBeGreaterThan(0);
    expect(village?.state.dwellings.length).toBeGreaterThan(0);
  });

  it('o 10 let posune o 3 650 dní a ves se dopočítá', async () => {
    const { settlements, villages, offsets, villageId } = await player();
    const deps = { settlements, villages, offsets, landscapes };
    const result = await skipTime(deps, skip({ skip: 'decade' }));
    expect(result).toEqual({ ok: true, today: WORLD_DAY + 3650, offsetDays: 3650 });
    expect(villages.records.get(villageId)?.state.lastDay).toBe(WORLD_DAY + 3650);
  });

  it('posun platí i druhý den – ves se načítá k posunutému dni', async () => {
    const { settlements, villages, offsets, villageId } = await player();
    await skipTime({ settlements, villages, offsets, landscapes }, skip());
    const tomorrow = await playerTime({ offsets }, { playerId: PLAYER, worldDay: WORLD_DAY + 1 });
    expect(tomorrow.today).toBe(WORLD_DAY + 31);
    const village = await loadVillage(
      { villages },
      { villageId, today: tomorrow.today, landscape },
    );
    expect(village?.state.lastDay).toBe(WORLD_DAY + 31);
  });

  it('nejvýš do posledního dne světa, pak odmítne', async () => {
    const offsets = new InMemoryTimeOffsets();
    const deps = {
      settlements: new InMemorySettlements(),
      villages: new InMemoryVillages(),
      offsets,
      landscapes,
    };
    const worldDay = LAST_DAY - 100;
    expect(await skipTime(deps, skip({ worldDay, skip: 'year' }))).toEqual({
      ok: true,
      today: LAST_DAY,
      offsetDays: 100,
    });
    expect(await skipTime(deps, skip({ worldDay }))).toEqual({
      ok: false,
      reason: WORLD_END_REACHED,
    });
    expect(await offsets.offsetOf(PLAYER)).toBe(100);
  });

  it('posun se nikdy nezmenší, ani když den světa mezitím doběhl k jeho konci', async () => {
    const offsets = new InMemoryTimeOffsets();
    offsets.offsets.set(PLAYER, 200);
    expect(await offsets.extend(PLAYER, 30, 150)).toBe(200);
    const deps = {
      settlements: new InMemorySettlements(),
      villages: new InMemoryVillages(),
      offsets,
      landscapes,
    };
    const result = await skipTime(deps, skip({ worldDay: LAST_DAY - 150 }));
    expect(result).toEqual({ ok: false, reason: WORLD_END_REACHED });
    expect(await offsets.offsetOf(PLAYER)).toBe(200);
  });

  it('hráč bez vsi posune jen čas', async () => {
    const offsets = new InMemoryTimeOffsets();
    const deps = {
      settlements: new InMemorySettlements(),
      villages: new InMemoryVillages(),
      offsets,
      landscapes,
    };
    expect(await skipTime(deps, skip({ skip: 'year' }))).toEqual({
      ok: true,
      today: WORLD_DAY + 365,
      offsetDays: 365,
    });
  });
});

describe('skipTime – průběh přepočtu (onProgress)', () => {
  /** Hráč se dvěma vsemi na dvou sídlech (druhá je kopie první) – volitelně druhá vymřelá. */
  async function twoVillages(
    options: { secondExtinct?: boolean } = {},
  ): Promise<Awaited<ReturnType<typeof player>> & { secondId: string }> {
    const first = await player();
    const other = await first.settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 12,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    if (!other) throw new Error('Druhé sídlo nevzniklo.');
    const state = structuredClone(first.villages.records.get(first.villageId)!.state);
    if (options.secondExtinct) state.extinctDay = WORLD_DAY - 1;
    const second = await first.villages.add(other.id, 'Lhota', state);
    return { ...first, secondId: second.id };
  }

  it('hlásí dny všech vsí rodu dohromady – od nuly po dnech až do celku', async () => {
    const { settlements, villages, offsets } = await twoVillages();
    const reports: { doneDays: number; totalDays: number }[] = [];
    const result = await skipTime(
      { settlements, villages, offsets, landscapes, onProgress: (p) => reports.push(p) },
      skip(),
    );
    expect(result.ok).toBe(true);
    expect(reports[0]).toEqual({ doneDays: 0, totalDays: 60 });
    expect(reports.at(-1)).toEqual({ doneDays: 60, totalDays: 60 });
    // po každém dni jedno hlášení, hotovo jen roste a celek se nemění
    expect(reports).toHaveLength(61);
    for (const [i, report] of reports.entries()) {
      expect(report).toEqual({ doneDays: i, totalDays: 60 });
    }
  });

  it('spící (vymřelá) ves se nedopočítává – do celku se nepočítá', async () => {
    const { settlements, villages, offsets } = await twoVillages({ secondExtinct: true });
    const reports: { doneDays: number; totalDays: number }[] = [];
    await skipTime(
      { settlements, villages, offsets, landscapes, onProgress: (p) => reports.push(p) },
      skip(),
    );
    expect(reports[0]).toEqual({ doneDays: 0, totalDays: 30 });
    expect(reports.at(-1)).toEqual({ doneDays: 30, totalDays: 30 });
  });

  it('výsledek nezávisí na hlášení ani na přestávkách – vsi jsou stejné', async () => {
    const plain = await twoVillages();
    const reported = await twoVillages();
    await skipTime({ ...plain, landscapes }, skip({ skip: 'year' }));
    let reports = 0;
    let pauses = 0;
    await skipTime(
      {
        ...reported,
        landscapes,
        // přestávka po každém desátém dni – kousky dopočtu jiné než vcelku
        pause: (day) =>
          day !== undefined && day % 10 === 0 ? (pauses++, Promise.resolve()) : null,
        onProgress: () => reports++,
      },
      skip({ skip: 'year' }),
    );
    expect(reports).toBe(2 * 365 + 1);
    expect(pauses).toBeGreaterThan(0);
    for (const id of [plain.villageId, plain.secondId]) {
      expect(reported.villages.records.get(id)?.state).toEqual(
        plain.villages.records.get(id)?.state,
      );
    }
  });
});
