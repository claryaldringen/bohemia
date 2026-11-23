import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../village/core/simulate';
import type { VillageEvent, VillageEventBody } from '../../village/core/inbox';
import { deathPointsFor } from '../../village/people/happiness';
import type { ChronicleEvent, VillageState } from '../../village/types';
import { DAY, dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import { noLoot, type RaidResult } from '../raid-apply';

// Úmrtí z výprav a války snižují štěstí vsi jako každé úmrtí (happiness.md – Úmrtí; Martin 23. 11. 2026)

function start(): VillageState {
  const people = [1, 2, 3, 4, 5, 6].map((id) => kin({ id, age: 30, sex: 'male' }));
  return village(people, [dwelling(1)], { storesKg: 100000 });
}

const raid = (extra: Partial<RaidResult>): VillageEventBody => ({
  kind: 'raid-result',
  result: {
    campaignId: 'c1',
    leader: 'Bořivoj',
    from: 'Lhota',
    target: 'Kněžice',
    declared: false,
    fallen: [],
    wounded: [],
    led: [],
    loot: noLoot(),
    pitsFound: [],
    ...extra,
  },
});

const at = (day: number, body: VillageEventBody): VillageEvent => ({
  id: 'e',
  villageId: 'v',
  day,
  seq: 1,
  body,
});

/** Body za úmrtí zapsaná do paměti štěstí v den `day`. */
function remembered(v: VillageState, day: number): number[] {
  return (v.happiness?.deaths ?? []).filter((d) => d.day === day).map((d) => d.points);
}

/** Body, které by dalo týchž mrtvých `death` v kronice dne. */
function chronicled(v: VillageState, day: number): number[] {
  return v.chronicle
    .filter((e: ChronicleEvent) => e.kind === 'death' && e.day === day)
    .map((e) => (e.kind === 'death' ? deathPointsFor(e) : 0));
}

function run(prepare: (v: VillageState) => void, body?: VillageEventBody): VillageState {
  const v = start();
  prepare(v);
  const day = v.lastDay + 1;
  return advanceVillage(v, day, null, null, body ? [at(day, body)] : []);
}

describe('úmrtí z výprav a války ve štěstí vsi', () => {
  const day = DAY + 1;
  const cases: [string, (v: VillageState) => void, VillageEventBody | undefined][] = [
    ['padlý při nájezdu (raid-result)', () => undefined, raid({ fallen: [1] })],
    [
      'zabitý šelmou na výpravě (journey-casualty)',
      () => undefined,
      { kind: 'journey-casualty', journeyId: 'j1', personId: 2, outcome: 'dead', by: 'bear' },
    ],
    [
      'padlý z tažení (campaign-return)',
      (v) => {
        v.people[2]!.away = { kind: 'campaign', refId: 'c1' };
      },
      { kind: 'campaign-return', result: { campaignId: 'c1', back: [], wounded: [], fallen: [3] } },
    ],
    [
      'padlý v řadě (line-man-fell)',
      () => undefined,
      { kind: 'line-man-fell', personId: 4, campaignId: 'c1' },
    ],
    [
      'úmrtí na rány',
      (v) => {
        v.people[4]!.woundDeathDay = DAY + 1;
      },
      undefined,
    ],
  ];

  it.each(cases)('%s sníží štěstí jako úmrtí ve vsi', (_n, prepare, body) => {
    const v = run(prepare, body);
    const points = chronicled(v, day);
    expect(points).toHaveLength(1);
    expect(points[0]).toBeGreaterThan(0);
    expect(remembered(v, day)).toEqual(points);
  });

  it('odvedený a zajatý do štěstí nepřibude', () => {
    const v = run(() => undefined, raid({ led: [1, 2] }));
    expect(v.people.some((p) => p.id === 1)).toBe(false);
    expect(remembered(v, day)).toEqual([]);
  });

  it('dopočet po kouscích dá týž stav jako vcelku', () => {
    const body = raid({ fallen: [1, 2] });
    const events = [at(DAY + 2, body)];
    const whole = advanceVillage(start(), DAY + 6, null, null, events);
    let chunked = start();
    for (const to of [DAY + 1, DAY + 2, DAY + 3, DAY + 6]) {
      chunked = advanceVillage(
        chunked,
        to,
        null,
        null,
        events.filter((e) => e.day <= to && e.day > chunked.lastDay),
      );
    }
    expect(remembered(whole, DAY + 2)).toHaveLength(2);
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });
});
