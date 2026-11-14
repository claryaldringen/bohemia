import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  type ExpeditionView,
  type ExpeditionVisitor,
  type PartyView,
} from '@bohemia/game';
import { sceneJourneysOf } from '../journey-view';
import { sceneLabor } from '../village-view-scene';
import { dayRoster } from '../scene/villager-plan';

// Výjezd ve scéně vsi (lord-control.md – Ve scéně, Soused; journey.md – Scéna vsi): vlastní výjezd
// z pohledu `JourneyView`, cizí z návštěvníků; muži na výjezdu nejsou v dni rodiny.

const HOME = { x: 3, y: 4 };

const person = (personId: number, group: number, over = {}): PartyView['people'][number] => ({
  personId,
  group,
  lord: false,
  rider: false,
  mounted: false,
  horse: null,
  horseId: null,
  wounded: false,
  strength: 1,
  female: false,
  child: false,
  ...over,
});

function view(over: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    journeyId: 'j1',
    villageId: 'v1',
    tick: 50,
    day: 10,
    home: HOME,
    homePos: { x: 5, z: 5 },
    seen: {},
    parties: [
      {
        id: 0,
        phase: 'out',
        controllable: true,
        leaderId: 7,
        waitDaysLeft: null,
        horseWork: null,
        groups: [
          {
            id: 0,
            cell: HOME,
            pos: { x: 5, z: 6 },
            goal: { cell: HOME, pos: { x: 40, z: 6 } },
            arrived: false,
          },
        ],
        people: [person(7, 0, { lord: true, mounted: true }), person(9, 0, { wounded: true })],
      },
    ],
    ...over,
  };
}

function visitor(over: Partial<ExpeditionVisitor> = {}): ExpeditionVisitor {
  return {
    journeyId: 'j2',
    partyId: 0,
    own: false,
    leaderName: 'Vratislav',
    houseName: 'Lučané',
    tick: 48,
    groups: [{ id: 0, pos: { x: -20, z: 30 }, goal: null }],
    people: [
      { personId: 1, group: 0, lord: true, mounted: true, led: false, female: false, child: false },
    ],
    ...over,
  };
}

describe('sceneJourneysOf', () => {
  it('vlastní hlouček na mapě vsi z pohledu, cizí z návštěvníků', () => {
    const own = visitor({
      journeyId: 'j1',
      own: true,
      leaderName: 'Bořivoj',
      houseName: 'Kněžičtí',
    });
    const list = sceneJourneysOf({ own: [view()], visitors: [own, visitor()], cell: HOME });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      journeyId: 'j1:0',
      partyId: 0,
      own: true,
      leader: 'Bořivoj',
      house: 'Kněžičtí',
      tick: 50,
      pos: { x: 5, z: 6 },
      goal: { x: 40, z: 6 },
      arrived: false,
      phase: 'out',
      // domov výpravy ze serveru (dvorec) – odjezd a příjezd se měří od něj
      home: { x: 5, z: 5 },
    });
    expect(list[0]!.men).toEqual([
      { key: '7', personId: 7, lord: true, mounted: true, wounded: false },
      { key: '9', personId: 9, lord: false, mounted: false, wounded: true },
    ]);
    expect(list[1]).toMatchObject({
      journeyId: 'j2:0',
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

  it('dva hloučky jedné skupiny jsou dva SceneJourney se stejným partyId', () => {
    const two = view();
    const party = two.parties[0]!;
    party.groups.push({ id: 1, cell: HOME, pos: { x: 9, z: 9 }, goal: null, arrived: true });
    party.people = [person(7, 0), person(8, 1), person(9, 1)];
    const list = sceneJourneysOf({ own: [two], visitors: [], cell: HOME });
    expect(list.map((j) => j.journeyId)).toEqual(['j1:0', 'j1:1']);
    expect(list.map((j) => j.partyId)).toEqual([0, 0]);
    expect(list.map((j) => j.men.length)).toEqual([1, 2]);
  });

  it('hlouček na jiné mapě se nekreslí, cíl na jiné mapě je null', () => {
    const away = view();
    away.parties[0]!.groups[0]!.cell = { x: 4, y: 4 };
    expect(sceneJourneysOf({ own: [away], visitors: [], cell: HOME })).toEqual([]);
    const crossing = view();
    crossing.parties[0]!.groups[0]!.goal = { cell: { x: 4, y: 4 }, pos: { x: 0, z: 0 } };
    expect(sceneJourneysOf({ own: [crossing], visitors: [], cell: HOME })[0]!.goal).toBeNull();
    expect(sceneJourneysOf({ own: [], visitors: [visitor()], cell: null })).toEqual([]);
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
