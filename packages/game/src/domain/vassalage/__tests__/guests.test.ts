import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../../village/actions';
import { startFortification } from '../../village/fortifications';
import { block, makeLandscape } from '../../village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import { villageFoodNeed } from '../../village/diet';
import type { VillageEvent } from '../../village/inbox';
import { guestLaborToday, laborPerDay } from '../../village/people';
import { advanceVillage } from '../../village/simulate';
import type { Guest, VillageState } from '../../village/types';
import {
  CORVEE_NO_HANDS,
  corveeGuests,
  corveeStints,
  corveeWorkers,
  dispatchCorvee,
  hostGuests,
  returnHome,
  sendAway,
  type CorveeInput,
} from '../guests';
import { DAY, receiver, sender } from './shipment-fixtures';

// Lidé a robota (vassalage.md – Lidé a robota; plán 2026-11-03 – rozhodnutí 11): lidé zůstávají
// ve stavu domovské vsi s `away`, hostitel je vede jako hosty, návrat v pevný den.

const TRAVEL = 2;
const corvee = (laborDays: number, refId = 'levy:d:v'): CorveeInput => ({
  laborDays,
  travelDays: TRAVEL,
  homeVillageId: 'v-home',
  hostVillageId: 'v-host',
  hostName: 'Lhota',
  refId,
});

function sent(state: VillageState, laborDays: number): { state: VillageState; guests: Guest[] } {
  const result = dispatchCorvee(state, DAY, corvee(laborDays));
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const homeLabor = (s: VillageState, day: number): number =>
  s.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);

const arrival = (guests: Guest[]): VillageEvent => ({
  id: 'g1',
  villageId: 'v-host',
  day: DAY + TRAVEL,
  seq: 1,
  body: { kind: 'guests-arrive', fromVillageId: 'v-home', fromName: 'Dub', guests },
});

describe('robota (dispatchCorvee, returnHome, hostGuests)', () => {
  it('robota 30 člověkodní: doma o člověka méně práce i jídla, u pána víc práce i jídla', () => {
    const home = sender();
    const { state, guests } = sent(home, 30);
    expect(guests).toHaveLength(1);
    const day = DAY + 1;
    expect(homeLabor(home, day) - homeLabor(state, day)).toBe(1);
    expect(villageFoodNeed(home, day) - villageFoodNeed(state, day)).toBeCloseTo(180 / 365, 9);
    // vstupní stav se nemění
    expect(home.people.some((p) => p.away)).toBe(false);

    const host = receiver();
    const before = villageFoodNeed(host, DAY + TRAVEL);
    hostGuests(host, DAY + TRAVEL, guests);
    expect(guestLaborToday(host, DAY + TRAVEL)).toBe(1);
    expect(villageFoodNeed(host, DAY + TRAVEL) - before).toBeCloseTo(180 / 365, 9);
  });

  it('cesta se do dní nepočítá: u pána přesně dny roboty, doma pryč i s cestou tam a zpět', () => {
    const { state, guests } = sent(sender(), 70);
    // 70 člověkodní po nejvýš 30 dnech = 3 lidé: 24, 23 a 23 dní
    expect(guests.map((g) => g.untilDay - (DAY + TRAVEL))).toEqual([24, 23, 23]);
    const away = state.people.filter((p) => p.away);
    expect(away.map((p) => p.away!.untilDay! - DAY).sort()).toEqual(
      [24, 23, 23].map((d) => d + 2 * TRAVEL).sort(),
    );
    expect(away.every((p) => p.away!.kind === 'labor' && p.away!.hostVillageId === 'v-host')).toBe(
      true,
    );
    expect(state.chronicle.at(-1)).toMatchObject({
      kind: 'people-away',
      people: 3,
      villageName: 'Lhota',
      untilDay: DAY + 24 + 2 * TRAVEL,
    });
  });

  it('návrat v pevný den – doma i u hostitele, bez události schránky', () => {
    const { state, guests } = sent(sender(), 30);
    const until = state.people.find((p) => p.away)!.away!.untilDay!;
    const before = advanceVillage(state, until - 1, null, null);
    expect(before.people.some((p) => p.away)).toBe(true);
    const back = advanceVillage(before, until, null, null);
    expect(back.people.some((p) => p.away)).toBe(false);
    expect(back.chronicle.filter((e) => e.kind === 'people-back')).toEqual([
      { day: until, kind: 'people-back', away: 'labor', people: 1 },
    ]);

    const host = advanceVillage(receiver(), DAY + TRAVEL + 29, null, null, [arrival(guests)]);
    expect(host.guests).toHaveLength(1);
    expect(host.chronicle.filter((e) => e.kind === 'guests-came')).toHaveLength(1);
    const left = advanceVillage(host, DAY + TRAVEL + 30, null, null);
    expect(left.guests).toBeUndefined();
  });

  it('po kouscích (obě vsi): 1, 7 i celé dny dají totéž', () => {
    const { state, guests } = sent(sender(), 60);
    const events = [arrival(guests)];
    const run = (start: VillageState, chunks: number[], inbox: VillageEvent[]): VillageState => {
      let s = start;
      let day = DAY;
      for (const n of chunks) {
        day += n;
        s = advanceVillage(s, day, null, null, inbox);
      }
      return s;
    };
    const ones = Array.from({ length: 40 }, () => 1);
    const home = run(state, [40], []);
    expect(run(state, ones, [])).toEqual(home);
    expect(run(state, [7, 13, 20], [])).toEqual(home);
    const host = run(receiver(), [40], events);
    expect(run(receiver(), ones, events)).toEqual(host);
    expect(run(receiver(), [1, 1, 5, 33], events)).toEqual(host);
    expect(home.people.some((p) => p.away)).toBe(false);
    expect(host.guests).toBeUndefined();
  });

  it('muži rodu ani jejich ženy na robotu nejdou; dům si nechá pracujícího dospělého', () => {
    const s = sender();
    s.dynasty = { lordId: 38, lords: [{ id: 38, fromDay: DAY - 100 }] };
    for (const p of s.people) if (p.id === 38 || p.id === 34) p.line = true;
    const workers = corveeWorkers(s, DAY).map((p) => p.id);
    expect(workers).not.toContain(38);
    expect(workers).not.toContain(39);
    expect(workers).not.toContain(34);
    // děti a starší nejdou
    for (const id of [32, 33, 36, 37]) expect(workers).not.toContain(id);
    expect(workers.length).toBeGreaterThan(0);
  });

  it('bez lidí na robotu – důvod, ves beze změny; opakování pozná už odeslanou robotu', () => {
    const s = sender();
    s.people = s.people.filter((p) => laborPerDay(p, DAY) === 0);
    expect(dispatchCorvee(s, DAY, corvee(10))).toEqual({ ok: false, reason: CORVEE_NO_HANDS });
    const { state, guests } = sent(sender(), 45);
    const byId = (a: Guest, b: Guest): number => a.ref.personId - b.ref.personId;
    expect(corveeGuests(state, corvee(45)).sort(byId)).toEqual([...guests].sort(byId));
    expect(corveeGuests(state, corvee(45, 'jiny'))).toEqual([]);
  });

  it('rozdělení dní: součet přesně, nejvýš měsíc na člověka, málo lidí – déle', () => {
    expect(corveeStints(0, 5)).toEqual([]);
    expect(corveeStints(30, 5)).toEqual([30]);
    expect(corveeStints(61, 5)).toEqual([21, 20, 20]);
    expect(corveeStints(100, 2)).toEqual([50, 50]);
    expect(corveeStints(10, 0)).toEqual([]);
  });

  it('sendAway nepřepíše jinou nepřítomnost; hostGuests nezdvojí hosta; returnHome bez nikoho nic', () => {
    const s = sender();
    sendAway(s, DAY, [34], { kind: 'service', untilDay: DAY + 5 });
    sendAway(s, DAY, [34], { kind: 'labor', untilDay: DAY + 50 });
    expect(s.people.find((p) => p.id === 34)!.away).toEqual({ kind: 'service', untilDay: DAY + 5 });
    const host = receiver();
    const guest: Guest = {
      ref: { villageId: 'v', personId: 1 },
      kind: 'labor',
      untilDay: DAY + 9,
      adult: true,
    };
    hostGuests(host, DAY, [guest]);
    hostGuests(host, DAY, [guest]);
    hostGuests(host, DAY + 9, [{ ...guest, ref: { villageId: 'v', personId: 2 } }]);
    expect(host.guests).toHaveLength(1);
    const plain = receiver();
    expect(returnHome(plain, DAY)).toEqual([]);
    expect(plain.guests).toBeUndefined();
  });

  it('starší ves bez hostů a nepřítomných se dopočítá bez nových částí stavu', () => {
    const s = advanceVillage(receiver(), DAY + 20, null, null);
    expect(s.guests).toBeUndefined();
    expect(s.people.some((p) => 'away' in p)).toBe(false);
  });

  it('práce hostů jde napřed do rozestavěného opevnění, zbytek do společné práce', () => {
    const day = dayIndexOf({ year: 600, month: 3, day: 15 });
    const empty = packObstacles([], 16, 15);
    const landscape = makeLandscape();
    const base = withBuiltFirstDwelling(
      foundVillage({ seed: 5, day, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
    );
    base.woodLogs = 200;
    const started = startFortification(base, base.lastDay, landscape, empty, {
      cells: block(8, 8, 4, 4),
      grid: null,
      kind: 'rampart',
    });
    if (!started.ok) throw new Error(started.reason);
    const fortDone = (s: VillageState): number =>
      s.constructions.find((c) => c.kind === 'fortification')?.done ?? 0;
    const guests: Guest[] = [5, 6, 7].map((personId) => ({
      ref: { villageId: 'v-home', personId },
      kind: 'labor',
      untilDay: started.state.lastDay + 100,
      adult: true,
    }));
    const hosted = structuredClone(started.state);
    hostGuests(hosted, hosted.lastDay, guests);
    const days = 5;
    const without = advanceVillage(started.state, started.state.lastDay + days, empty, landscape);
    const withGuests = advanceVillage(hosted, hosted.lastDay + days, empty, landscape);
    // 3 hosté × 5 dní = 15 čd navíc přímo do valu
    expect(fortDone(withGuests) - fortDone(without)).toBeCloseTo(15, 2);
    // hosté jedí ze zásob hostitele
    expect(withGuests.storesKg).toBeLessThan(without.storesKg);
  });
});
