import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import { applyInboxDay, type VillageEvent } from '../inbox';
import { advanceVillage, advanceVillageSteps } from '../simulate';
import type { ChronicleEvent, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

const FOUNDED = 200;

function village(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
}

/** Událost schránky – zápis do kroniky se jménem `name`. */
function named(seq: number, day: number, name: string): VillageEvent {
  return {
    id: `e${seq}`,
    villageId: 'v1',
    day,
    seq,
    body: { kind: 'chronicle', event: { day, kind: 'line-named', name } },
  };
}

/** Tři události: dvě ve dni 5 (zapsané v opačném pořadí než `seq`) a jedna ve dni 9. */
function threeEvents(start: number): VillageEvent[] {
  return [named(2, start + 5, 'Druhý'), named(1, start + 5, 'První'), named(3, start + 9, 'Třetí')];
}

/** Zápisy schránky v kronice (jména v pořadí). */
function inboxEntries(state: VillageState): { day: number; name: string }[] {
  return state.chronicle.flatMap((e) =>
    e.kind === 'line-named' ? [{ day: e.day, name: e.name }] : [],
  );
}

/** Co by vydala schránka: události s `afterDay < day ≤ toDay`. */
function pending(events: readonly VillageEvent[], afterDay: number, toDay: number): VillageEvent[] {
  return events.filter((e) => e.day > afterDay && e.day <= toDay);
}

describe('schránka vsi – applyInboxDay', () => {
  it('použije jen události daného dne v pořadí seq a zapíše je do kroniky s tím dnem', () => {
    const state = village();
    const events = [named(7, 12, 'B'), named(3, 12, 'A'), named(1, 13, 'C'), named(9, 10, 'D')];
    const chronicle = applyInboxDay(state, 12, events);
    expect(chronicle).toEqual<ChronicleEvent[]>([
      { day: 12, kind: 'line-named', name: 'A' },
      { day: 12, kind: 'line-named', name: 'B' },
    ]);
  });

  it('zápis do kroniky dostane den použití, ne den z těla (událost posunutá na lastDay + 1)', () => {
    const event = named(1, 20, 'Pozdě');
    const late: VillageEvent = {
      ...event,
      body: { kind: 'chronicle', event: { day: 15, kind: 'line-named', name: 'Pozdě' } },
    };
    expect(applyInboxDay(village(), 20, [late])).toEqual([
      { day: 20, kind: 'line-named', name: 'Pozdě' },
    ]);
  });

  it('vstupní události nemění', () => {
    const events = threeEvents(FOUNDED);
    const before = JSON.stringify(events);
    const out = applyInboxDay(village(), FOUNDED + 5, events);
    out[0]!.day = -1;
    expect(JSON.stringify(events)).toBe(before);
  });
});

describe('schránka vsi – dopočet', () => {
  const start = village();
  const end = start.lastDay + 20;
  const events = threeEvents(start.lastDay);
  const whole = advanceVillage(start, end, null, null, events);

  it('události dne se použijí na začátku svého dne, jen jednou', () => {
    expect(inboxEntries(whole)).toEqual([
      { day: start.lastDay + 5, name: 'První' },
      { day: start.lastDay + 5, name: 'Druhý' },
      { day: start.lastDay + 9, name: 'Třetí' },
    ]);
    // první zápis dne 5 předchází všem zápisům simulace toho dne
    const firstOfDay = whole.chronicle.findIndex((e) => e.day === start.lastDay + 5);
    expect(whole.chronicle[firstOfDay]).toMatchObject({ kind: 'line-named', name: 'První' });
  });

  it.each([1, 3, 10])('po kouscích po %i dnech = vcelku (stejný JSON)', (size) => {
    let chunked = village();
    while (chunked.lastDay < end) {
      const to = Math.min(end, chunked.lastDay + size);
      chunked = advanceVillage(chunked, to, null, null, pending(events, chunked.lastDay, to));
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });

  it('po kouscích s celým seznamem událostí = vcelku (mimo rozsah se přeskočí)', () => {
    let chunked = village();
    while (chunked.lastDay < end) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + 4), null, null, events);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });

  it('události s day ≤ lastDay se přeskočí', () => {
    const at = advanceVillage(village(), start.lastDay + 6, null, null, events);
    const past = [named(10, start.lastDay + 6, 'Pozdě'), named(11, start.lastDay, 'Dávno')];
    const after = advanceVillage(at, end, null, null, [...events, ...past]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(whole));
  });

  it.each([1, 7, 40])(
    'přerušený generátor (po %i krocích zahozený) vstup nezmění; s přestávkami = vcelku',
    (steps) => {
      const input = village();
      const inputJson = JSON.stringify(input);
      const eventsJson = JSON.stringify(events);
      const abandoned = advanceVillageSteps(input, end, null, null, events);
      for (let i = 0; i < steps; i++) abandoned.next();
      expect(JSON.stringify(input)).toBe(inputJson);
      expect(JSON.stringify(events)).toBe(eventsJson);
      // nový dopočet téhož vstupu se zastávkami ve všech yield bodech
      const resumed = advanceVillageSteps(input, end, null, null, events);
      let pauses = 0;
      let step = resumed.next();
      while (!step.done) {
        pauses++;
        step = resumed.next();
      }
      expect(pauses).toBeGreaterThan(20);
      expect(JSON.stringify(step.value)).toBe(JSON.stringify(whole));
    },
  );

  it('bez událostí dává totéž co dřív', () => {
    expect(JSON.stringify(advanceVillage(village(), end, null, null, []))).toBe(
      JSON.stringify(advanceVillage(village(), end, null)),
    );
  });
});

describe('schránka vsi – rod-baptized', () => {
  const baptized = (seq: number, day: number): VillageEvent => ({
    id: `b${seq}`,
    villageId: 'v1',
    day,
    seq,
    body: { kind: 'rod-baptized', houseId: 'house-1' },
  });

  it('zapíše den křtu rodu jednou – opakovaná událost ho nezmění', () => {
    const state = village();
    expect(state.faith).toBeUndefined();
    expect(applyInboxDay(state, 300, [baptized(1, 300)])).toEqual([]);
    expect(state.faith?.rodBaptizedDay).toBe(300);
    applyInboxDay(state, 301, [baptized(2, 301)]);
    expect(state.faith?.rodBaptizedDay).toBe(300);
  });
});
