import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import type { NearbyVillage, VillageNearby, VillageNews, VillageState } from '../../types';
import { applyNearby, nearbyTarget, nearestNearby, nearestWith } from '../nearby';
import { D, homeVillage, report } from './market-fixtures';

// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): snímek vsí na 8 sousedních mapách, který
// ves dostane událostí schránky `nearby` a celý ho nahradí další snímek.

const A: NearbyVillage = { villageId: 'A', name: 'Lhota', cells: 1, firstStep: 'E' };
const B: NearbyVillage = { villageId: 'B', name: 'Dubá', cells: 1, firstStep: 'N' };
const C: NearbyVillage = { villageId: 'C', name: 'Hora', cells: 2, firstStep: 'SW' };

const nearbyOf = (day: number, villages: NearbyVillage[]): VillageNearby => ({
  day,
  self: { villageId: 'h', name: 'Vlkov' },
  villages,
});

const event = (day: number, nearby: VillageNearby): VillageEvent => ({
  id: `nearby-${day}`,
  villageId: 'h',
  day,
  seq: day,
  body: { kind: 'nearby', nearby },
});

/** Zpráva na pivo o vsi `village` s řemesly `crafts`. */
const newsOf = (village: NearbyVillage, crafts: VillageNews['report']['crafts']): VillageNews => ({
  villageId: village.villageId,
  name: village.name,
  report: { ...report, crafts },
});

/** Ves H s okolím A, B, C a zprávami `news`. */
function withNearby(news?: VillageNews[]): VillageState {
  const s = homeVillage();
  s.nearby = nearbyOf(D, [A, B, C]);
  if (news) s.news = news;
  return s;
}

describe('applyNearby – událost schránky `nearby`', () => {
  it('zapíše odeslaný snímek s dnem události, druhá událost ho celý nahradí', () => {
    const first = nearbyOf(D + 1, [A, C]);
    const s1 = advanceVillage(homeVillage(), D + 1, null, null, [event(D + 1, first)]);
    expect(s1.nearby).toEqual(first);
    // druhý snímek odeslaný den předem (schránka ho posunula na D + 2) – den je den události
    const second = nearbyOf(D + 1, [B]);
    const s2 = advanceVillage(s1, D + 2, null, null, [event(D + 2, second)]);
    expect(s2.nearby).toEqual({ ...second, day: D + 2 });
  });

  it('kronika nic, stav nesdílí tělo události', () => {
    const s = homeVillage();
    const sent = nearbyOf(D + 1, [{ ...A }]);
    expect(applyNearby(s, D + 1, sent)).toEqual([]);
    sent.villages[0]!.name = 'Jiná';
    expect(s.nearby).toEqual(nearbyOf(D + 1, [A]));
  });
});

describe('nejbližší ves okolí', () => {
  it('nearestWith – první ves okolí, o jejímž řemeslníkovi ves ví ze zprávy', () => {
    const s = withNearby([newsOf(A, ['potter']), newsOf(B, ['smith']), newsOf(C, ['smith'])]);
    expect(nearestWith(s, 'smith')).toEqual(B);
    expect(nearestWith(s, 'potter')).toEqual(A);
    expect(nearestWith(s, 'carpenter')).toBeNull();
  });

  it('bez zpráv nearestWith nic, nearestNearby první ves okolí', () => {
    const s = withNearby();
    expect(nearestWith(s, 'smith')).toBeNull();
    expect(nearestNearby(s)).toEqual(A);
  });

  it('bez okolí nic', () => {
    const s = homeVillage();
    s.news = [newsOf(B, ['smith'])];
    expect(nearestWith(s, 'smith')).toBeNull();
    expect(nearestNearby(s)).toBeNull();
    s.nearby = nearbyOf(D, []);
    expect(nearestNearby(s)).toBeNull();
  });
});

describe('nearbyTarget – cíl výpravy z okolí', () => {
  it('ves okolí → cíl s domovskou vsí ze `self`; mimo okolí a bez okolí null', () => {
    const s = withNearby();
    expect(nearbyTarget(s, 'B')).toEqual({
      villageId: 'B',
      name: 'Dubá',
      cells: 1,
      firstStep: 'N',
      homeVillageId: 'h',
      homeName: 'Vlkov',
    });
    expect(nearbyTarget(s, 'X')).toBeNull();
    expect(nearbyTarget(homeVillage(), 'B')).toBeNull();
  });
});
