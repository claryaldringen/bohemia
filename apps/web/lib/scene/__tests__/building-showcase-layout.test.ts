import { describe, expect, it } from 'vitest';
import {
  DECAY_HOUSE_SHARE,
  MILIR_OFFSET_M,
  SHOWCASE_BUILDINGS,
  SHOWCASE_GROUNDS,
  SHOWCASE_PEN,
  decayAt,
  decayLabel,
  showcaseDecay,
  SHOWCASE_PLOUGH_DAY_S,
  showcasePlough,
  showcasePloughDay,
  structureRepairLabel,
} from '../building-showcase-layout';
import { decayStage } from '../dwelling-decay';
import { ploughFront } from '../plough-front';
import { pathAt, ploughPath, type PathPoint } from '../plough-team';

describe('SHOWCASE_BUILDINGS', () => {
  it('milíř stojí „kus od“ uhlířovy zemnice – 8 až 12 m', () => {
    const uhlir = SHOWCASE_BUILDINGS.find((b) => b.id === 'uhlir')!;
    const [hut, milir] = uhlir.models;
    expect(Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z)).toBeGreaterThanOrEqual(8);
    expect(Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z)).toBeLessThanOrEqual(12);
    expect(Math.hypot(milir!.x - hut!.x, milir!.z - hut!.z)).toBeCloseTo(
      Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z),
    );
  });

  it('stavby se nepřekrývají (dílny ≈ 7 × 9 m, milíř s okolím ≈ 6 m)', () => {
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const a = models[i]!;
        const b = models[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(9);
      }
    }
  });

  it('pozemky polozemnic (15 × 15 m) se nepřekrývají a nezasahují do ostatních staveb', () => {
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    // dvorec vojvody (trade.md) má pozemek dvou políček – jen pozemky polozemnic
    const plots = models.flatMap((m) => (m.plot && !m.plot.yard ? [m.plot] : []));
    expect(plots.length).toBe(6);
    expect(new Set(plots.map((p) => p.variant)).size).toBe(5);
    for (const p of plots) {
      for (const q of plots) {
        if (p === q) continue;
        const apart = Math.abs(p.x - q.x) >= 15 || Math.abs(p.z - q.z) >= 15;
        expect(apart).toBe(true);
      }
      for (const m of models) {
        if (m.plot) continue;
        // ostatní stavby i se staveništěm (≈ 5 m od středu) leží mimo políčko pozemku
        const outside = Math.abs(m.x - p.x) > 7.5 + 4.5 || Math.abs(m.z - p.z) > 7.5 + 4.5;
        expect(outside, m.kind).toBe(true);
      }
    }
  });

  it('ohrada (15 × 15 m) nezasahuje do staveb, pozemků ani čtverců za nimi; branka míří k nejbližšímu obydlí', () => {
    const pen = SHOWCASE_PEN.square;
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    for (const m of models) {
      const room = m.plot ? 15 : 7.5 + 5;
      const [x, z] = m.plot ? [m.plot.x, m.plot.z] : [m.x, m.z];
      const apart = Math.abs(x - pen.x) >= room || Math.abs(z - pen.z) >= room;
      expect(apart, m.kind).toBe(true);
    }
    for (const ground of SHOWCASE_GROUNDS) {
      for (const square of ground.squares) {
        // čtverce i s okrajem 2 m (spřežení se na souvratích otáčí za okrajem pole)
        const apart = Math.abs(square.x - pen.x) >= 15 + 2 || Math.abs(square.z - pen.z) >= 15 + 2;
        expect(apart, ground.id).toBe(true);
      }
    }
    // spřežení ukázky „Orání“ se ani na souvratích k ohradě nepřiblíží
    const at: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
    for (let day = 0; day < 8; day++) {
      for (const { field } of ploughFront({ ...showcasePlough(day), pens: [] })) {
        const path = ploughPath(field);
        for (let d = 0; d < path.length; d += 0.5) {
          pathAt(path, d, at);
          const apart = Math.abs(at.x - pen.x) >= 7.5 + 4 || Math.abs(at.z - pen.z) >= 7.5 + 4;
          expect(apart).toBe(true);
        }
      }
    }
    const dwellings = models.filter((m) => m.kind === 'zemnice' || m.kind === 'polozemnice');
    const nearest = dwellings.reduce((best, m) =>
      Math.hypot(m.x - pen.x, m.z - pen.z) < Math.hypot(best.x - pen.x, best.z - pen.z) ? m : best,
    );
    expect(nearest.x).toBe(SHOWCASE_PEN.toward.x);
    expect(nearest.z).toBe(SHOWCASE_PEN.toward.z);
  });
});

describe('ukázka orby po čtvercích', () => {
  it('čelo orby postoupí každý den ukázky o 3/8 čtverce, spřežení stojí na čele', () => {
    expect(showcasePloughDay(0)).toBe(0);
    expect(showcasePloughDay(SHOWCASE_PLOUGH_DAY_S * 1000 * 3 + 1)).toBe(3);
    const ploughed = (day: number): number =>
      showcasePlough(day).fields[0]!.parts.reduce(
        (sum, p) => sum + (p.look === 'plowed' ? (p.work ?? 1) : 0),
        0,
      );
    for (let day = 0; day < 8; day++) {
      expect(ploughed(day)).toBeCloseTo(((day + 1) * 3) / 8, 9);
      const village = showcasePlough(day);
      const [team, ...rest] = ploughFront({ ...village, pens: [] });
      expect(rest).toEqual([]);
      // spřežení na rozpracovaném dílu (poslední den na posledním zoraném)
      const front = village.fields[0]!.parts.find((p) => p.work !== undefined);
      expect(team!.partId).toBe(front?.id ?? village.fields[0]!.parts.at(-1)!.id);
      // fronta dne: díly, přes které orba dnes postoupila, v pořadí od vsi
      expect(village.labor.shares[0]!.parts).toContain(team!.partId);
    }
    // po zorání všech tří čtverců začne znovu
    expect(ploughed(8)).toBeCloseTo(ploughed(0), 9);
  });
});

describe('ukázka rozpadu obydlí', () => {
  it('posuvník: stav opuštěného obydlí 100 → 0 %, pak zbytek jámy zarůstá', () => {
    expect(decayAt(0)).toEqual({ condition: 1 });
    expect(decayAt(DECAY_HOUSE_SHARE / 2)).toEqual({ condition: 0.5 });
    expect(decayAt(DECAY_HOUSE_SHARE)).toEqual({ overgrowth: 0 });
    expect(decayAt(1)).toEqual({ overgrowth: 1 });
    expect(decayLabel(0)).toMatch(/^stav 100 % – celý dům/);
    expect(decayLabel(DECAY_HOUSE_SHARE + 0.2)).toMatch(/^zbytek jámy – 5 let po zániku/);
    expect(decayLabel(1)).toMatch(/zmizel/);
  });

  it('opuštěné stavby (abandonment.md): chátrají s posuvníkem, pak zbytky a rozpadlý plot', () => {
    const start = showcaseDecay(0);
    expect(start.sacred!.buildings.map((b) => [b.kind, b.condition, b.abandoned])).toEqual([
      ['idol', undefined, true],
      ['shrine', undefined, true],
    ]);
    expect(start.pens![0]!.stocked).toBe(false);
    const half = showcaseDecay(DECAY_HOUSE_SHARE / 2);
    expect(half.sacred!.buildings[0]!.condition).toBeCloseTo(0.5, 2);
    expect(half.cemeteries![0]!.fence).toBeCloseTo(0.5, 2);
    expect(half.pens![0]!.condition).toBeCloseTo(0.5, 2);
    const fallen = showcaseDecay(DECAY_HOUSE_SHARE + 0.1);
    expect(fallen.sacred!.buildings).toEqual([]);
    expect(fallen.sacred!.ruins!.map((r) => r.kind)).toEqual(['idol', 'shrine']);
    expect(fallen.cemeteries![0]!.fence).toBe(0);
    // starý hřbitov bez plotu – zůstaly mohyly podle významu (Martin, 19. 10. 2026)
    const sizes = new Set(fallen.cemeteries![0]!.mounds!.map((m) => m.size));
    expect(sizes.has('great') && sizes.has('small')).toBe(true);
    expect(fallen.pens).toEqual([]);
    expect(showcaseDecay(1).sacred!.ruins).toBeUndefined();
  });

  it('oprava staveb (abandonment.md – Oprava): stav roste s průběhem, ohniště až po opravě', () => {
    const start = showcaseDecay(0, true);
    const [idol, shrine] = start.sacred!.buildings;
    expect(idol).toMatchObject({ condition: 0.1, repairing: true });
    expect(idol).not.toHaveProperty('abandoned');
    expect(decayStage(shrine!.condition)).toBe(3);
    expect(start.cemeteries![0]!.fence).toBe(0);
    expect(start.pens![0]!.condition).toBe(0.1);
    expect(start.pens![0]).not.toHaveProperty('stocked');
    const half = showcaseDecay(0.5, true);
    expect(half.sacred!.buildings[0]!.condition).toBe(0.55);
    expect(half.cemeteries![0]!.fence).toBe(0.5);
    // obydlí dál chátrají podle posuvníku
    expect(half.dwellings).toEqual(showcaseDecay(0.5).dwellings);
    const done = showcaseDecay(1, true);
    expect(done.sacred!.buildings.every((b) => b.condition === undefined && !b.repairing)).toBe(
      true,
    );
    expect(done.cemeteries![0]!.fence).toBeUndefined();
    expect(structureRepairLabel(0.5)).toContain('oprava 50 %');
    expect(structureRepairLabel(1)).toContain('opraveno');
  });

  it('dvojice podle posuvníku a řada všech stupňů se zbytky jam, nic se nepřekrývá', () => {
    const start = showcaseDecay(0);
    const pair = start.dwellings.filter((d) => d.id < 9100);
    expect(pair.map((d) => d.type)).toEqual(['zemnice', 'polozemnice']);
    expect(pair[1]!.plot).toBeDefined();
    expect(pair.every((d) => d.inhabited === false)).toBe(true);
    const row = start.dwellings.filter((d) => d.id >= 9100);
    expect(row.map((d) => decayStage(d.condition))).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(start.ruins).toHaveLength(2);
    const later = showcaseDecay(DECAY_HOUSE_SHARE + 0.1);
    expect(later.dwellings.filter((d) => d.id < 9100)).toEqual([]);
    expect(later.ruins!.filter((r) => r.id < 9100).map((r) => r.type)).toEqual([
      'zemnice',
      'polozemnice',
    ]);
    expect(showcaseDecay(1).ruins).toHaveLength(2);
    const spots = [...start.dwellings, ...start.ruins!].map((d) => d.position);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const gap = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z);
        expect(gap).toBeGreaterThan(9);
      }
    }
    // mimo ostatní stavby ukázky (řada staveb z = 0, pozemky z = −26)
    for (const p of spots) expect(p.z).toBeLessThan(-40);
  });
});
