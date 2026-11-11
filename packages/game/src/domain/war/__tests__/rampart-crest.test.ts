import { describe, expect, it } from 'vitest';
import {
  climbTicks,
  fortOutlineOf,
  fortSegments,
  rampartPace,
  segmentBand,
  startRampartOn,
  wallLineInM,
} from '../../village/fortification';
import type { Fortification } from '../../village/fortification/types';
import { FORTIFICATIONS } from '../../village/rules/rules-fortifications';
import type { FortTop } from '../../village/types/types-fortifications';
import { battleTick, type BattleField, type BattleState } from '../battle';
import { MARCH_RAMPART, MARCH_WALL, marchCellAt } from '../march-grid';
import { WAR } from '../rules-war';
import { tickRandom } from '../ticks';
import { crestAt, crownAt, reachOf, wallPosts } from '../wall-defense';
import {
  DAY,
  attacker,
  battle,
  defender,
  field,
  fighter,
  forestSouth,
  fortOf,
  land,
  palisade,
} from './battle-fixtures';

// Hradba na koruně valu (fortifications.md – Hradby a obrana, Druhy – Pás s valem; Martin 9. 11.
// 2026: „Pokud se jedná o palisádu nebo polský plot, má stát na koruně valu“): čára hradby na
// bojišti je koruna valu, obránce na ní stojí o 2 m výš (dál dohlédne, dostřelí, dohodí), útočník
// leze napřed přes příkop a val a pak po delším žebříku.

const TPS = WAR.campaign.ticksPerSecond;
const C = FORTIFICATIONS.defense.crest;

/** Val s příkopem na křivce s hradbou `top` na koruně (vše hotové ve dni 0). */
function rampartWith(top: FortTop, gate = false): Fortification {
  const base = gate ? { ...palisade(true), kind: 'rampart' as const } : fortOf('rampart');
  return { ...base, top, segments: base.segments.map((s) => ({ ...s, topBuiltDay: 0 })) };
}

/** Palisáda (s ochozem) s valem doplněným vně – hotový val pod stojící hradbou. */
function wallWithRampartOutside(kind: 'palisade' | 'walkway'): Fortification {
  const fort: Fortification = { ...palisade(false), kind };
  fort.segments = fort.segments.map((s) => ({ ...s }));
  for (const seg of fort.segments) {
    startRampartOn(fort, seg);
    seg.builtDay = 0;
  }
  return fort;
}

/** Vzdálenost bodu od křivky obvodu dovnitř (m) – průmět na nejbližší úsečku lomené čáry. */
function insideOfCurve(fort: Fortification, p: { x: number; z: number }): number {
  const outline = fortOutlineOf(land(), fort);
  if (!outline) throw new Error('obvod chybí');
  const pts = outline.polyline;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = Math.min(1, Math.max(0, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / len2));
    const d = Math.hypot(p.x - (a[0] + dx * t), p.z - (a[1] + dz * t));
    best = Math.min(best, d);
  }
  return best;
}

describe('čára hradby na koruně valu', () => {
  it('val na křivce: čára úseku na bojišti 7 m od křivky (příkop 4 + půl paty 3)', () => {
    const fort = rampartWith('palisade');
    expect(wallLineInM(fort)).toBe(7);
    const f = field([fort]);
    const bf = f.forts[0]!;
    const outline = fortOutlineOf(land(), fort)!;
    const curve = fortSegments(outline);
    for (const s of bf.shapes) {
      const l = s.line;
      const mid = { x: l.x + (l.dx * l.length) / 2, z: l.z + (l.dz * l.length) / 2 };
      expect(insideOfCurve(fort, mid)).toBeGreaterThan(6.5);
      expect(insideOfCurve(fort, { x: l.x, z: l.z })).toBeGreaterThan(6.5);
      expect(s.index).toBe(curve[bf.shapes.indexOf(s)]!.index);
    }
    // obvod na koruně je kratší než na křivce (vnitřní rovnoběžka)
    const sum = (xs: { lengthM: number }[]): number => xs.reduce((a, x) => a + x.lengthM, 0);
    expect(sum(bf.shapes)).toBeLessThan(sum(curve));
  });

  it('val doplněný vně pod stojící palisádu: hradba stojí na místě, val pod ní a před ní', () => {
    const fort = wallWithRampartOutside('palisade');
    expect(wallLineInM(fort)).toBe(0);
    const seg = fort.segments[0]!;
    expect(segmentBand(fort, seg)).toEqual({ inM: 3, outM: 7 });
    const before = field([palisade(false)]).forts[0]!.shapes.map((s) => s.line);
    const after = field([fort]).forts[0]!.shapes.map((s) => s.line);
    expect(after).toEqual(before);
  });

  it('brána na valu se posune s úsekem poměrně a ulička klešťové brány začíná na koruně', () => {
    const fort = rampartWith('walkway', true);
    fort.gates = [{ ...fort.gates[0]!, pincerDay: 0 }];
    const bf = field([fort]).forts[0]!;
    const g = bf.fort.gates[0]!;
    const shape = bf.shapes.find((s) => s.index === g.segment)!;
    const curve = fortSegments(fortOutlineOf(land(), fort)!)[g.segment]!;
    const stored = fort.gates[0]!;
    expect(g.offsetM / shape.line.length).toBeCloseTo(stored.offsetM / curve.line.length, 9);
  });
});

describe('obránce na koruně valu', () => {
  it('ochoz na valu: stanoviště na koruně – luk +5 m, hod +2 m, dohled +25 m', () => {
    const f = field([rampartWith('walkway')]);
    const posts = wallPosts(f.forts, 4, DAY);
    expect(posts).toHaveLength(4);
    for (const q of posts) {
      expect(crestAt(f.forts, q)).toBe(true);
      expect(crownAt(f.forts, q, DAY)).toBe(true);
    }
    const b = battle({
      attackers: [],
      defenders: [defender(1, posts[0]!, { post: posts[0]!, onWall: true, bow: true })],
    });
    const r = reachOf(fighter(b, 'd:1'), f);
    expect(r.bowMaxM).toBe(WAR.combat.bowMaxM + C.bowM);
    expect(r.throwM).toBe(FORTIFICATIONS.defense.throwM + C.throwM);
    expect(r.sightM).toBe(WAR.sight.openM + C.sightM);
  });

  it('ochoz bez valu: stejné stanoviště bez výhody koruny', () => {
    const f = field([fortOf('walkway')]);
    const q = wallPosts(f.forts, 1, DAY)[0]!;
    expect(crestAt(f.forts, q)).toBe(false);
    const b = battle({ attackers: [], defenders: [defender(1, q, { post: q, onWall: true })] });
    const r = reachOf(fighter(b, 'd:1'), f);
    expect(r).toEqual({
      sightM: WAR.sight.openM,
      bowMaxM: WAR.combat.bowMaxM,
      throwM: FORTIFICATIONS.defense.throwM,
    });
  });

  it('val doplněný vně: obránce za palisádou stojí na koruně, útočník u paty žebříku ne', () => {
    const f = field([wallWithRampartOutside('walkway')]);
    const q = wallPosts(f.forts, 1, DAY)[0]!;
    expect(crestAt(f.forts, q)).toBe(true);
    const l = f.forts[0]!.shapes[0]!.line;
    const top = { x: l.x + (l.dx * l.length) / 2, z: l.z + (l.dz * l.length) / 2 };
    // pata žebříku 1 m vně čáry hradby (na vnějším svahu valu)
    const out = { x: top.x - (q.x - top.x), z: top.z - (q.z - top.z) };
    expect(crestAt(f.forts, out)).toBe(false);
  });
});

describe('útočník přes val na hradbu', () => {
  it('žebřík na hradbu na valu je delší – výstup o 2 s déle (plný val)', () => {
    const plain = climbTicks('palisade');
    const crest = climbTicks('palisade', 1);
    expect(crest.up - plain.up).toBe(FORTIFICATIONS.assault.climbSeconds.upRampart * TPS);
    expect(climbTicks('palisade', 0.5).up - plain.up).toBe(
      Math.round(FORTIFICATIONS.assault.climbSeconds.upRampart * 0.5 * TPS),
    );
    // plot na valu se přelézá jako na zemi – na val se vyleze chůzí
    expect(climbTicks('fence', 1)).toEqual(climbTicks('fence'));
  });

  it('pás valu pod hradbou: útočník jde tempem valu, obránce plným, pochod neprojde', () => {
    const f: BattleField = field([rampartWith('palisade')]);
    const l = f.forts[0]!.shapes[0]!.line;
    const mid = { x: l.x + (l.dx * l.length) / 2, z: l.z + (l.dz * l.length) / 2 };
    const cell = marchCellAt(f.grid, mid);
    expect(f.grid.flags[cell]! & MARCH_WALL).toBe(MARCH_WALL);
    expect(f.grid.flags[cell]! & MARCH_RAMPART).toBe(MARCH_RAMPART);
    expect(f.grid.pace[cell]).toBe(0);
    // útočník na vnitřním svahu… vně: 2 m před čarou hradby (na vnějším svahu valu), obránce
    // ve středu opevnění – útočník k němu jde po valu tempem plného valu
    const c = f.forts[0]!.center;
    const n = Math.hypot(mid.x - c.x, mid.z - c.z);
    const start = { x: mid.x + ((mid.x - c.x) / n) * 2, z: mid.z + ((mid.z - c.z) / n) * 2 };
    const startCell = marchCellAt(f.grid, start);
    expect(f.grid.flags[startCell]! & MARCH_RAMPART).toBe(MARCH_RAMPART);
    const b = battle({
      attackers: [attacker(0, start)],
      defenders: [defender(1, { ...c }, { atHouseOnly: true })],
    });
    const a = fighter(b, 'a:0');
    battleTick(b, f, tickRandom(7, 1, 'battle'));
    const moved = Math.hypot(a.pos.x - start.x, a.pos.z - start.z);
    const full = WAR.pace.metersPerSecond / TPS;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(full * rampartPace(1) + 1e-6);
  });
});

describe('bitva u hradby na valu po kouscích', () => {
  it('žebříky na ochoz na valu: 1 / 7 / 40 taktů přes JSON = vcelku, lezec až po valu', () => {
    const start = (): BattleState => {
      const b = battle({
        attackers: Array.from({ length: 6 }, (_, i) => attacker(i, { x: i * 3 - 8, z: -50 })),
        defenders: [
          defender(1, { x: 0, z: -18 }, { strength: 0.4 }),
          defender(2, { x: 4, z: -18 }, { strength: 1 }),
          defender(3, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 }),
        ],
      });
      b.groups[0]!.assault = 'ladder';
      return b;
    };
    const f = field([rampartWith('walkway')], forestSouth);
    const TICKS = 900;
    const whole = start();
    for (let t = 1; t <= TICKS; t++) battleTick(whole, f, tickRandom(7, t, 'battle'));
    const ladders = whole.ladders ?? [];
    expect(ladders.length).toBeGreaterThan(0);
    // vrchol žebříku na koruně valu (7 m od křivky), ne na vnějším okraji příkopu
    for (const l of ladders) expect(insideOfCurve(f.forts[0]!.fort, l.top)).toBeGreaterThan(6.5);
    for (const chunk of [1, 7, 40]) {
      let b = start();
      for (let t = 1; t <= TICKS; t++) {
        battleTick(b, f, tickRandom(7, t, 'battle'));
        if (t % chunk === 0) b = JSON.parse(JSON.stringify(b)) as BattleState;
      }
      expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(whole)));
    }
  });
});
