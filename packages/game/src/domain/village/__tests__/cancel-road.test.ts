import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cancelBlock, cancelConstruction } from '../cancel-construction';
import { startRoadUpgrade } from '../road-upgrades';
import type { Construction, Road, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zrušení rozdělané úpravy cesty a vozové cesty (plán cest v2, Úloha 10b; Martin 23. 10. 2026:
// jen rozestavěné, vrátí se nespotřebované suroviny): hotové úseky zůstanou.

const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.nextId = 100;
  s.constructions = [];
  s.lastDay = DAY;
  s.woodLogs = 100;
  return s;
}

function road(id: number, from: number, to: number, extra: Partial<Road> = {}): Road {
  return {
    id,
    points: [
      { x: from, z: -120 },
      { x: to, z: -120 },
    ],
    bornDay: DAY - 20 * 365,
    grade: 'trodden',
    traffic: [5],
    spots: [],
    ground: { wet: [], fords: [] },
    ...extra,
  };
}

function withRoads(s: VillageState, roads: Road[]): VillageState {
  s.roads = {
    nextId: 50,
    roads,
    trees: [],
    candidates: [],
    labor: { from: DAY, days: 0, shares: [] },
  };
  return s;
}

const last = (s: VillageState): Construction => s.constructions.at(-1)!;

describe('zrušení rozdělané úpravy cesty', () => {
  it('hotový úsek zůstane upravený, zbytek ne, klády se vrátí na hromadu', () => {
    const started = startRoadUpgrade(
      withRoads(village(), [road(7, -60, 40), road(9, 40, 140)]),
      DAY,
      9,
      'improved',
      null,
    );
    const c = last(started);
    c.wood = { trees: 4, fromPile: 4, felled: 0, fell: [] };
    c.done = c.cost * 0.75; // první úsek hotový, druhý rozdělaný
    const logs = started.woodLogs ?? 0;
    const next = cancelConstruction(started, DAY, c.id);
    expect(next.constructions).toHaveLength(0);
    expect(next.roads!.roads.find((r) => r.id === 7)!.grade).toBe('improved');
    expect(next.roads!.roads.find((r) => r.id === 9)!.grade).toBe('trodden');
    // 4 klády × 0,75 zabudováno → 1 zpět
    expect((next.woodLogs ?? 0) - logs).toBe(1);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'construction-cancelled' });
  });

  it('bez práce se nezmění žádný úsek a vrátí se všechno dřevo', () => {
    const started = startRoadUpgrade(
      withRoads(village(), [road(7, -60, 40)]),
      DAY,
      7,
      'improved',
      null,
    );
    last(started).wood = { trees: 2, fromPile: 2, felled: 0, fell: [] };
    const logs = started.woodLogs ?? 0;
    const next = cancelConstruction(started, DAY, last(started).id);
    expect(next.roads!.roads[0]!.grade).toBe('trodden');
    expect((next.woodLogs ?? 0) - logs).toBe(2);
  });

  it('zemská stezka se zrušit nedá', () => {
    const c = {
      ...last(startRoadUpgrade(withRoads(village(), [road(7, -60, 40)]), DAY, 7, 'improved', null)),
      trail: 3,
    };
    expect(cancelBlock(c)).not.toBeNull();
  });
});

describe('zrušení vozové cesty ve stavbě', () => {
  function wagonVillage(builtPieces: number): VillageState {
    const s = withRoads(village(), [road(7, 0, 30, { grade: 'wagon', cart: true })]);
    s.roads!.earthworks = [
      {
        id: 20,
        profile: [0, 30, 60, 90].map((x) => ({ x, z: -120, y: 10 })),
        pieces: [30, 60, 90].map((toM, k) => ({
          toM,
          manDays: 10,
          builtDay: k < builtPieces ? DAY : null,
        })),
        fords: [3],
        startedDay: DAY,
        constructionId: 21,
      },
    ];
    s.constructions.push({
      id: 21,
      kind: 'road',
      startedDay: DAY,
      cost: 30,
      done: 15,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      roadIds: [],
      earthwork: 20,
    });
    return s;
  }

  it('hotové úseky zůstanou vozové, zemní práce se zkrátí na ně', () => {
    const next = cancelConstruction(wagonVillage(1), DAY, 21);
    expect(next.constructions).toHaveLength(0);
    expect(next.roads!.roads[0]!.grade).toBe('wagon');
    const e = next.roads!.earthworks![0]!;
    expect(e.constructionId).toBeUndefined();
    expect(e.pieces).toHaveLength(1);
    expect(e.profile.at(-1)).toMatchObject({ x: 30 });
    expect(e.fords).toBeUndefined();
  });

  it('bez hotového úseku zemní práce zmizí', () => {
    const next = cancelConstruction(wagonVillage(0), DAY, 21);
    expect(next.roads!.earthworks).toEqual([]);
  });
});
