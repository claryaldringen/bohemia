import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../village/actions';
import { departAppointee } from '../../village/appoint-lord';
import type { VillageEvent } from '../../village/inbox';
import { lordFamily } from '../../village/lord';
import { advanceVillage } from '../../village/simulate';
import {
  DAY,
  kin,
  trackedVillage,
  village,
  type KinSpec,
} from '../../village/__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import type { VillageState } from '../../village/types';
import { checkEnnoble, ENNOBLE_REASONS, ennobleYear, settleNoble } from '../ennoble';

// Povýšení vesničana (vassalage.md – Povýšení vesničana).

const FARMER: KinSpec[] = [
  { id: 1, age: 30, sex: 'male', spouse: 2 },
  { id: 2, age: 28, sex: 'female', spouse: 1 },
  { id: 3, age: 9, sex: 'male', father: 1, mother: 2 },
  { id: 4, age: 15, sex: 'male' },
  { id: 5, age: 40, sex: 'female' },
];

function peasants(day = DAY): VillageState {
  const state = village(FARMER.map((k) => kin(k, day)));
  state.lastDay = day;
  state.storesKg = 1000;
  return state;
}

describe('checkEnnoble', () => {
  it('povýšit smí muže od 16 let, který není z rodu vojvody', () => {
    const state = peasants();
    expect(checkEnnoble(state, 1, DAY)).toBeNull();
    expect(checkEnnoble(state, 4, DAY)).toBe(ENNOBLE_REASONS.tooYoung);
    expect(checkEnnoble(state, 5, DAY)).toBe(ENNOBLE_REASONS.notMale);
    expect(checkEnnoble(state, 99, DAY)).toBe(ENNOBLE_REASONS.noPerson);
  });

  it('muž rodu vojvody povýšit nejde', () => {
    const state = trackedVillage([
      { id: 10, age: 50, sex: 'male' },
      { id: 12, age: 25, sex: 'male', father: 10 },
    ]);
    expect(checkEnnoble(state, 10, DAY)).toBe(ENNOBLE_REASONS.lineMan);
    expect(checkEnnoble(state, 12, DAY)).toBe(ENNOBLE_REASONS.lineMan);
  });

  it('herní rok se počítá po 365,25 dne', () => {
    expect(ennobleYear(0)).toBe(0);
    expect(ennobleYear(366)).toBe(1);
  });
});

/** Ves založená hrou, bez muže rodu: čeká na vojvodu. */
function waitingVillage(): VillageState {
  const state = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: 200, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  for (const p of state.people) delete p.line;
  state.dynasty = { lordId: null, lords: [{ id: 1, fromDay: 200, toDay: 200 }], endedDay: 200 };
  state.awaitingLord = { sinceDay: 200 };
  return state;
}

describe('příjezd povýšeného', () => {
  const start = waitingVillage();
  const end = start.lastDay + 20;
  const { party } = departAppointee(peasants(start.lastDay), start.lastDay, 1, 'Lhota');
  const events: VillageEvent[] = [
    {
      id: 'e1',
      villageId: 'v1',
      day: start.lastDay + 6,
      seq: 1,
      body: { kind: 'noble-arrives', party, houseId: 'npc-1', fromVillageId: 'x' },
    },
  ];
  const whole = advanceVillage(start, end, null, null, events);

  it('rodina dostane noble, muž je vojvodou vsi a ves řídí NPC rod', () => {
    expect(whole.awaitingLord).toBeUndefined();
    const head = whole.people.find((p) => p.id === whole.nobles?.headId);
    expect(head?.sex).toBe('male');
    expect(head?.line).toBe(true);
    expect(whole.dynasty?.lordId).toBe(head?.id);
    expect(whole.nobles?.houseId).toBe('npc-1');
    const nobles = whole.people.filter((p) => p.noble?.houseId === 'npc-1');
    expect(nobles).toHaveLength(3); // muž, manželka, syn (15letý svobodný nemá s nimi příbuzenství)
  });

  it('synové šlechtice cvičí jako synové vojvody', () => {
    const family = lordFamily(whole, whole.lastDay);
    expect(family.lord?.id).toBe(whole.nobles?.headId);
    const son = whole.people.find(
      (p) => p.noble && p.sex === 'male' && p.id !== whole.nobles?.headId,
    );
    expect(son?.line).toBe(true);
    expect(family.trainees.map((p) => p.id)).toContain(son?.id);
  });

  it.each([1, 3, 10])('po kouscích po %i dnech = vcelku (stejný JSON)', (size) => {
    let chunked = waitingVillage();
    while (chunked.lastDay < end) {
      const to = Math.min(end, chunked.lastDay + size);
      const day = chunked.lastDay;
      chunked = advanceVillage(
        chunked,
        to,
        null,
        null,
        events.filter((e) => e.day > day && e.day <= to),
      );
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });

  it('settleNoble přímo zapíše nobles s číslem hlavy', () => {
    const state = waitingVillage();
    settleNoble(state, state.lastDay, structuredClone(party), 'npc-2');
    expect(state.nobles?.houseId).toBe('npc-2');
    expect(state.people.find((p) => p.id === state.nobles?.headId)?.noble).toBeDefined();
  });
});
