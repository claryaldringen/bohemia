import { describe, expect, it } from 'vitest';
import { ARMY_LOOKS, RIDER_LIFT_M } from '../army';
import {
  CHILD_FIGURE_SCALE,
  alarmAt,
  alarmFigures,
  alarmMoving,
  type SceneAlarm,
} from '../refugee-march';

// Průvod uprchlíků a posel ve scéně (war.md – Varování, poslové a útěk do hradiště; Ú14): hlouček
// lidí s nůšemi, stádo za nimi, posel pěšky i na koni, plynulý posun mezi snímky.

const alarm = (o: Partial<SceneAlarm> = {}): SceneAlarm => ({
  tick: 100,
  refugees: [
    {
      key: 'c1:a1',
      mode: 'all',
      pos: { x: 0, z: 0 },
      heading: { x: 1, z: 0 },
      people: [
        { kind: 'woman', child: true, carries: false },
        { kind: 'man', child: false, carries: true },
        { kind: 'woman', child: false, carries: true },
      ],
      herd: 4,
      moving: true,
    },
  ],
  messengers: [{ key: 'c1:a2', pos: { x: 50, z: 50 }, heading: { x: 0, z: 1 }, mounted: true }],
  ...o,
});

describe('alarmFigures', () => {
  it('dospělí vpředu s nůší, dítě menší vzadu; stádo za hloučkem; posel na koni', () => {
    const { figures, animals } = alarmFigures(alarm());
    const folk = figures.filter((f) => f.key.startsWith('r'));
    expect(folk.map((f) => [f.kind, f.clip, f.scale ?? 1])).toEqual([
      ['man', 'carry', 1],
      ['woman', 'carry', 1],
      ['woman', 'walk', CHILD_FIGURE_SCALE],
    ]);
    expect(folk.every((f) => f.look === ARMY_LOOKS.folk && f.hx === 1)).toBe(true);
    const cows = animals.filter((a) => a.species === 'cow');
    expect(cows).toHaveLength(4);
    // stádo jde za lidmi (proti směru chůze)
    const tail = Math.min(...folk.map((f) => f.x));
    expect(cows.every((c) => c.x < tail && c.speed > 0)).toBe(true);
    const rider = figures.find((f) => f.key === 'msc1:a2')!;
    expect([rider.clip, rider.lift, rider.look]).toEqual(['ride', RIDER_LIFT_M, ARMY_LOOKS.line]);
    expect(animals.filter((a) => a.species === 'horse')).toHaveLength(1);
  });

  it('posel pěšky zrychlenou chůzí bez koně; průvod vždy jde', () => {
    const still = alarm({
      messengers: [{ key: 'm', pos: { x: 0, z: 0 }, heading: { x: 0, z: 1 }, mounted: false }],
    });
    const { figures, animals } = alarmFigures(still);
    expect(figures.filter((f) => f.key.startsWith('r')).every((f) => f.clip !== 'idle')).toBe(true);
    expect(animals.filter((a) => a.species === 'cow').every((a) => a.speed > 0)).toBe(true);
    expect(animals.some((a) => a.species === 'horse')).toBe(false);
    const runner = figures.find((f) => f.key === 'msm')!;
    expect([runner.clip, runner.lift]).toEqual(['walk', 0]);
    expect(runner.pace).toBeGreaterThan(1);
    expect(alarmMoving(still)).toBe(true);
    expect(alarmMoving(alarm({ messengers: [], refugees: [] }))).toBe(false);
  });

  it('uvízlý průvod (`moving` false) stojí – klip stání, stádo stojí, scéna nekreslí v taktu', () => {
    const stuck = alarm({ messengers: [] });
    stuck.refugees = stuck.refugees.map((r) => ({ ...r, moving: false }));
    const { figures, animals } = alarmFigures(stuck);
    expect(figures.every((f) => f.clip === 'idle')).toBe(true);
    expect(animals.every((a) => a.speed === 0)).toBe(true);
    expect(alarmMoving(stuck)).toBe(false);
    // s poslem se kreslí dál
    expect(alarmMoving({ ...stuck, messengers: alarm().messengers })).toBe(true);
  });
});

describe('alarmAt', () => {
  it('mezi snímky jde průvod plynule ve směru posunu, i když v novém stojí', () => {
    const from = alarm();
    const to = alarm({
      tick: 140,
      refugees: [{ ...from.refugees[0]!, pos: { x: 0, z: 20 } }],
    });
    const half = alarmAt(from, to, 0.5, 10);
    expect(half.refugees[0]!.pos).toEqual({ x: 0, z: 10 });
    expect(half.refugees[0]!.heading).toEqual({ x: 0, z: 1 });
    expect(alarmAt(from, to, 1, 10)).toBe(to);
  });

  it('nový průvod a skok přes mapu stojí rovnou v novém snímku', () => {
    const from = alarm({ refugees: [] });
    const jump = alarm({
      messengers: [
        { key: 'c1:a2', pos: { x: 5000, z: 0 }, heading: { x: 1, z: 0 }, mounted: true },
      ],
    });
    const at = alarmAt(from, jump, 0.5, 10);
    expect(at.refugees[0]!.pos).toEqual({ x: 0, z: 0 });
    expect(at.messengers[0]!.pos).toEqual({ x: 5000, z: 0 });
  });
});
