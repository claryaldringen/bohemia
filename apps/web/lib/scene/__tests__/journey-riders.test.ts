import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@bohemia/game';
import {
  JourneyGlide,
  headingOf,
  journeyFigures,
  journeyFormation,
  pickRider,
  ridersAt,
  selectedRider,
  type SceneJourney,
} from '../journey-riders';

// Jezdci výjezdu ve scéně vsi (lord-control.md – Ve scéně; journey.md – Scéna vsi).

const man = (key: string, mounted: boolean, lord = false, wounded = false) => ({
  key,
  personId: Number(key),
  lord,
  mounted,
  wounded,
});

function journey(over: Partial<SceneJourney> = {}): SceneJourney {
  return {
    journeyId: 'j1',
    own: true,
    leader: 'Bořivoj',
    house: 'Kněžičtí',
    tick: 100,
    pos: { x: 10, z: 20 },
    goal: null,
    men: [man('1', true, true), man('2', true), man('3', false), man('4', false, false, true)],
    arrived: false,
    phase: 'out',
    waitDaysLeft: null,
    home: null,
    ...over,
  };
}

describe('journeyFormation – rozestavení kolem středu skupiny', () => {
  it('vojvoda na koni uprostřed, jezdci vpředu, pěší za nimi a raněný vzadu', () => {
    const poses = journeyFormation(journey(), { x: 0, z: 1 });
    expect(poses.map((p) => p.key)).toEqual(['1', '2', '3', '4']);
    const at = new Map(poses.map((p) => [p.key, p]));
    expect(at.get('1')).toMatchObject({ x: 10, z: 20, mounted: true, lord: true });
    // směr na sever (+z): pěší mají menší z než jezdci
    const riderZ = Math.min(at.get('1')!.z, at.get('2')!.z);
    expect(at.get('3')!.z).toBeLessThan(riderZ);
    expect(at.get('4')!.z).toBeLessThan(riderZ);
    // nikdo nestojí na sobě
    for (const a of poses) {
      for (const b of poses) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.9);
      }
    }
    expect(poses.every((p) => p.speed === 0 && p.hz === 1)).toBe(true);
  });

  it('otočený směr otočí celý hlouček kolem středu', () => {
    const north = journeyFormation(journey(), { x: 0, z: 1 });
    const east = journeyFormation(journey(), { x: 1, z: 0 });
    north.forEach((n, i) => {
      const e = east[i]!;
      // vzdálenost od středu se nemění
      expect(Math.hypot(e.x - 10, e.z - 20)).toBeCloseTo(Math.hypot(n.x - 10, n.z - 20), 6);
    });
    // pěší jsou na východ směrem za jezdci – menší x
    expect(east[2]!.x).toBeLessThan(10);
  });
});

describe('ridersAt – každý muž jde plynule, ne jen střed skupiny', () => {
  it('muž jde ze své nakreslené polohy na nové místo v hloučku a hledí, kam jde', () => {
    const from = journeyFormation(journey(), { x: 0, z: 1 });
    // skupina se otočí na východ a posune o 3 m – místa mužů se změní různě
    const to = journeyFormation(journey({ pos: { x: 13, z: 20 } }), { x: 1, z: 0 });
    const half = ridersAt(from, to, 0.5, 2);
    half.forEach((p, i) => {
      expect(p.x).toBeCloseTo((from[i]!.x + to[i]!.x) / 2, 6);
      expect(p.z).toBeCloseTo((from[i]!.z + to[i]!.z) / 2, 6);
      const d = Math.hypot(to[i]!.x - from[i]!.x, to[i]!.z - from[i]!.z);
      expect(p.speed).toBeCloseTo(d / 2, 6);
      expect(p.hx).toBeCloseTo((to[i]!.x - from[i]!.x) / d, 6);
    });
    // pěší vzadu jde jinou cestou než vojvoda – posun mužů není posun středu
    const lordMove = Math.hypot(half[0]!.x - from[0]!.x, half[0]!.z - from[0]!.z);
    const footMove = Math.hypot(half[3]!.x - from[3]!.x, half[3]!.z - from[3]!.z);
    expect(Math.abs(lordMove - footMove)).toBeGreaterThan(0.5);
    // na konci stojí na novém místě
    expect(ridersAt(from, to, 1, 2)).toEqual(to);
  });

  it('nový muž a skok přes mapu stojí rovnou v novém stavu', () => {
    const from = journeyFormation(journey({ men: [man('1', true, true)] }), { x: 0, z: 1 });
    const to = journeyFormation(journey({ pos: { x: 900, z: 20 } }), { x: 1, z: 0 });
    expect(ridersAt(from, to, 0.5, 2)).toEqual(to);
  });
});

describe('JourneyGlide – plynule mezi stavy ze serveru', () => {
  it('muži jdou k novému stavu tak dlouho, kolik taktů uběhlo', () => {
    const glide = new JourneyGlide();
    expect(glide.set([journey()], 0, false)).toBe(true);
    const start = glide.at(0, false).poses;
    // 4 takty po 250 ms = 1 s; dotaz přišel po 1 s
    expect(glide.set([journey({ tick: 104, pos: { x: 10, z: 23 } })], 1000, false)).toBe(true);
    const mid = glide.at(1000 + 2 * TICK_MS, false);
    expect(mid.moving).toBe(true);
    expect(mid.poses[0]!.z).toBeCloseTo(start[0]!.z + 1.5, 6);
    const end = glide.at(1000 + 4 * TICK_MS, false);
    expect(end.poses[0]!.z).toBeCloseTo(23, 6);
    expect(end.moving).toBe(false);
  });

  it('stejný takt pohyb nepřeruší a omezený pohyb stojí rovnou na novém místě', () => {
    const glide = new JourneyGlide();
    glide.set([journey()], 0, false);
    glide.set([journey({ tick: 104, pos: { x: 10, z: 24 } })], 1000, false);
    expect(glide.set([journey({ tick: 104, pos: { x: 10, z: 24 } })], 1200, false)).toBe(false);
    expect(glide.at(1500, false).poses[0]!.z).toBeCloseTo(22, 6);
    const frozen = new JourneyGlide();
    frozen.set([journey()], 0, true);
    frozen.set([journey({ tick: 104, pos: { x: 10, z: 24 } })], 1000, true);
    expect(frozen.at(1100, true).poses[0]!.z).toBeCloseTo(24, 6);
  });

  it('zmizelý výjezd scéna nekreslí', () => {
    const glide = new JourneyGlide();
    glide.set([journey()], 0, false);
    expect(glide.set([], 10, false)).toBe(true);
    expect(glide.active()).toBe(false);
    expect(glide.at(20, false).poses).toEqual([]);
  });
});

describe('headingOf, journeyFigures a pickRider', () => {
  it('směr z posunu, jinak k cíli, jinak jako dřív', () => {
    expect(headingOf(journey(), journey({ pos: { x: 14, z: 20 } }), null)).toEqual({ x: 1, z: 0 });
    expect(headingOf(null, journey({ goal: { x: 10, z: 10 } }), null)).toEqual({ x: 0, z: -1 });
    expect(headingOf(journey(), journey(), { x: -1, z: 0 })).toEqual({ x: -1, z: 0 });
  });

  it('jezdec sedí na koni, pěší jde s oštěpem, stojící jezdec na stojícím koni', () => {
    const poses = journeyFormation(journey(), { x: 0, z: 1 });
    const moving = poses.map((p) => ({ ...p, speed: 1.5 }));
    const out = journeyFigures(moving);
    expect(out.animals).toHaveLength(2);
    expect(out.figures.map((f) => f.clip)).toEqual(['ride', 'ride', 'walk-spear', 'walk-spear']);
    expect(out.figures[0]!.lift).toBeGreaterThan(1);
    const still = journeyFigures(poses);
    expect(still.figures.map((f) => f.clip)).toEqual(['ride-idle', 'ride-idle', 'idle', 'idle']);
    expect(still.animals.every((a) => a.speed === 0)).toBe(true);
  });

  it('klik na jezdce ho najde podle průmětu od země po hlavu', () => {
    const poses = journeyFormation(journey(), { x: 0, z: 1 });
    // pohled shora: x → px, z → py, výška posune nahoru o 10 px/m
    const project = (x: number, y: number, z: number) => ({ x: x * 10, y: z * 10 - y * 10 });
    const hit = pickRider(poses, 100, 200 - 15, project, () => 0);
    expect(hit?.pose.key).toBe('1');
    expect(pickRider(poses, 0, 0, project, () => 0)).toBeNull();
  });
});

// Martin 14. 11. 2026: „Někam jsem poslal vojvodu, ale zmizelo kolem něj označení.“ – vojvoda na
// výjezdu už není postava vsi, výběr (osoba vsi) jde s jeho jezdcem jako jednotka v 0 A.D.
describe('selectedRider – výběr jede s jezdcem', () => {
  it('vybraná osoba vsi je jezdec vlastního výjezdu, jak je nakreslený – i když se hýbe', () => {
    const glide = new JourneyGlide();
    glide.set([journey()], 0, false);
    // 20 taktů (5 s) po 5 s – muži jdou 5 s, v půli cesty
    glide.set([journey({ tick: 120, pos: { x: 30, z: 20 } })], 20 * TICK_MS, false);
    const poses = glide.at(30 * TICK_MS, false).poses;
    const lord = selectedRider(poses, 1)!;
    expect(lord).toBe(poses.find((p) => p.key === '1'));
    expect(lord.speed).toBeGreaterThan(0);
    expect(lord.x).toBeGreaterThan(10);
    expect(lord.x).toBeLessThan(30);
  });

  it('nikdo vybraný, muž mimo výjezd a cizí jezdec – nic', () => {
    const poses = journeyFormation(journey(), { x: 0, z: 1 });
    expect(selectedRider(poses, null)).toBeNull();
    expect(selectedRider(poses, 99)).toBeNull();
    const visitor = journeyFormation(journey({ own: false }), { x: 0, z: 1 });
    expect(selectedRider(visitor, 1)).toBeNull();
  });
});
