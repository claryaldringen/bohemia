import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, type JourneyView, type JourneyVisitor } from '@bohemia/game';
import { sceneJourneysOf } from '../journey-view';
import { sceneLabor } from '../village-view-scene';
import { dayRoster } from '../scene/villager-plan';

// Výjezd ve scéně vsi (lord-control.md – Ve scéně, Soused; journey.md – Scéna vsi): vlastní výjezd
// z pohledu `JourneyView`, cizí z návštěvníků; muži na výjezdu nejsou v dni rodiny.

const HOME = { x: 3, y: 4 };

function view(over: Partial<JourneyView> = {}): JourneyView {
  return {
    journeyId: 'j1',
    tick: 50,
    day: 10,
    phase: 'out',
    cell: HOME,
    home: HOME,
    homePos: { x: 5, z: 5 },
    men: [
      { personId: 7, lord: true, mounted: true, wounded: false },
      { personId: 9, lord: false, mounted: false, wounded: true },
    ],
    group: { pos: { x: 5, z: 6 }, goal: { cell: HOME, pos: { x: 40, z: 6 } }, arrived: false },
    waitDaysLeft: null,
    controllable: true,
    seen: null,
    ...over,
  };
}

function visitor(over: Partial<JourneyVisitor> = {}): JourneyVisitor {
  return {
    journeyId: 'j2',
    own: false,
    leader: 'Vratislav',
    house: 'Lučané',
    tick: 48,
    pos: { x: -20, z: 30 },
    goal: null,
    men: [{ lord: true, mounted: true }],
    ...over,
  };
}

describe('sceneJourneysOf', () => {
  it('vlastní výjezd na mapě vsi z pohledu, cizí z návštěvníků', () => {
    const own = visitor({ journeyId: 'j1', own: true, leader: 'Bořivoj', house: 'Kněžičtí' });
    const list = sceneJourneysOf({ own: view(), visitors: [own, visitor()], cell: HOME });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      journeyId: 'j1',
      own: true,
      leader: 'Bořivoj',
      house: 'Kněžičtí',
      tick: 50,
      pos: { x: 5, z: 6 },
      goal: { x: 40, z: 6 },
      arrived: false,
      phase: 'out',
      // domov výjezdu ze serveru (dvorec) – odjezd a příjezd se měří od něj
      home: { x: 5, z: 5 },
    });
    expect(list[0]!.men).toEqual([
      { key: '7', personId: 7, lord: true, mounted: true, wounded: false },
      { key: '9', personId: 9, lord: false, mounted: false, wounded: true },
    ]);
    expect(list[1]).toMatchObject({
      journeyId: 'j2',
      own: false,
      leader: 'Vratislav',
      house: 'Lučané',
      arrived: null,
      phase: null,
      waitDaysLeft: null,
      home: null,
    });
    expect(list[1]!.men).toEqual([
      { key: '0', personId: null, lord: true, mounted: true, wounded: false },
    ]);
  });

  it('vlastní výjezd na jiné mapě se nekreslí, cíl na jiné mapě je null', () => {
    const away = view({ cell: { x: 4, y: 4 } });
    expect(sceneJourneysOf({ own: away, visitors: [], cell: HOME })).toEqual([]);
    const crossing = view({
      group: {
        pos: { x: 1, z: 1 },
        goal: { cell: { x: 4, y: 4 }, pos: { x: 0, z: 0 } },
        arrived: false,
      },
    });
    expect(sceneJourneysOf({ own: crossing, visitors: [], cell: HOME })[0]!.goal).toBeNull();
    expect(sceneJourneysOf({ own: null, visitors: [visitor()], cell: null })).toHaveLength(1);
  });
});

describe('muži na výjezdu nejsou v dni rodiny', () => {
  const DAY = dayIndexOf({ year: 600, month: 5, day: 5 });
  const people = { children: 0, adults: 2, elders: 0 };

  it('vojvoda na výjezdu necvičí na dvorku (jako muž pryč)', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    s.lord = { trains: true };
    s.labor = { day: DAY, shares: [], lord: { training: 4, field: 0, household: 4 } };
    const home = sceneLabor(s, people)!.lord!;
    const lordId = home.trainees[0]!.id;
    expect(lordId).toBeDefined();
    const lord = s.people.find((p) => p.id === lordId)!;
    lord.away = { kind: 'journey', refId: 'j1' };
    const away = sceneLabor(s, people)?.lord;
    expect(away?.trainees.some((t) => t.id === lordId) ?? false).toBe(false);
  });
  it('muž na tažení se v dni rodiny nekreslí, muž doma ano', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    s.lord = { trains: true };
    s.labor = { day: DAY, shares: [], lord: { training: 4, field: 0, household: 4 } };
    const home = sceneLabor(s, people)!.lord!;
    const [away, stays] = [home.trainees[0]!.id, home.trainees[1]?.id];
    s.people.find((p) => p.id === away)!.away = { kind: 'campaign', untilDay: DAY + 30 };
    const out = sceneLabor(s, people)?.lord;
    expect(out?.trainees.some((t) => t.id === away) ?? false).toBe(false);
    if (stays !== undefined) expect(out?.trainees.some((t) => t.id === stays)).toBe(true);
  });

  it('kdo je pryč (tažení), je v lidech dne označen a roster ho doma nevydá', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    s.labor = { day: DAY, shares: [] };
    const all = sceneLabor(s, people)!.persons!;
    const id = all[0]!.id;
    s.people.find((p) => p.id === id)!.away = { kind: 'campaign', untilDay: DAY + 30 };
    const out = sceneLabor(s, people)!;
    expect(out.persons!.find((p) => p.id === id)?.away).toBe(true);
    expect(out.persons!.filter((p) => p.away).length).toBe(1);
    const roster = dayRoster(out, 5);
    expect(roster.takeId(id)).toBeNull();
    const taken = new Set<number>();
    for (let p = roster.take({ from: 0, to: 200 }); p; p = roster.take({ from: 0, to: 200 })) {
      taken.add(p.id);
    }
    expect(taken.has(id)).toBe(false);
    expect(taken.size).toBe(all.length - 1);
  });
});
