import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../calendar';
import { createRandom } from '../../landscape/random';
import type { Fortification } from '../../village/fortification/types';
import { battleTick, type BattleField, type BattleState } from '../battle';
import { fighterStrength, ladderMakeTicks, ladderSpot, pushLadder } from '../ladders';
import type { Pos } from '../march-grid';
import { dist2, setGroupAssault } from '../orders';
import { hoursPerTick, tickRandom } from '../ticks';
import {
  attacker,
  battle,
  defender,
  field,
  fighter,
  forestSouth,
  fortOf,
  palisade,
  run,
} from './battle-fixtures';
import { campaign, member } from './campaign-fixtures';

// Přechod hradby v boji (fortifications.md – Obrana bez násobku 1, 4, 5; Přechod hradby; plán
// hradeb – Úloha 9): žebříky, přelézání plotu, souboj u žebříku a únava po valu.

/** Jeden útočník proti obránci doma uprostřed (neobsazená hradba). */
function lone(
  fort: Fortification,
  o: { ladder?: boolean } = {},
): {
  b: BattleState;
  f: BattleField;
} {
  const f = field([fort], forestSouth);
  const b = battle({
    attackers: [attacker(0, { x: 0, z: -50 })],
    defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
  });
  if (o.ladder) fighter(b, 'a:0').ladder = true;
  return { b, f };
}

/** Takty po fázích přechodu (stav po taktu); `inside` – takt, kdy je muž za hradbou v boji. */
function crossing(
  b: BattleState,
  f: BattleField,
  ticks: number,
): { count: Record<string, number>; inside: number; atForest: number } {
  const count: Record<string, number> = {};
  let inside = -1;
  let atForest = 0;
  run(b, f, ticks, (t) => {
    const a = fighter(b, 'a:0');
    const c = a.climb;
    if (c) count[c.phase] = (count[c.phase] ?? 0) + 1;
    if (c?.phase === 'make' && c.at && dist2(a.pos, c.at) <= 1.5 * 1.5) atForest++;
    if (inside < 0 && a.state === 'fight' && Math.abs(a.pos.z) < 30 && Math.abs(a.pos.x) < 30) {
      inside = t;
    }
  });
  return { count, inside, atForest };
}

describe('žebřík přes neobsazenou hradbu (Přechod hradby)', () => {
  it('palisáda bez ochozu: vyrobí žebřík za 4 mužohodiny, opře, vyleze, přetáhne druhý, sleze', () => {
    // 4 mužohodiny ÷ (24 h ÷ 344 taktů) = 57,3 → 58 taktů
    expect(ladderMakeTicks(hoursPerTick(OFFICIAL_WORLD))).toBe(Math.ceil((4 * 344) / 24));
    const { b, f } = lone(palisade(false));
    const r = crossing(b, f, 2000);
    expect(r.atForest).toBe(58);
    expect(r.count.lean).toBe(8);
    expect(r.count.up).toBe(16);
    expect(r.count.over).toBe(16);
    expect(r.count.down).toBe(16);
    expect(r.inside).toBeGreaterThan(0);
    expect(b.breaches).toEqual([]);
    expect(b.ladders).toHaveLength(1);
    const l = b.ladders![0]!;
    // druhý žebřík zůstal uvnitř, žebřík je volný
    expect(l.inner).not.toBeNull();
    expect(l.climber).toBeNull();
    expect(l.up).toBe(true);
    expect(b.outcome).toBe('attackers');
  });

  it('palisáda s ochozem: bez druhého žebříku, dolů násypem 8 taktů', () => {
    const { b, f } = lone(fortOf('walkway'), { ladder: true });
    const r = crossing(b, f, 2000);
    expect(r.count.make).toBeUndefined();
    expect(r.count.lean).toBe(8);
    expect(r.count.up).toBe(16);
    expect(r.count.over).toBeUndefined();
    expect(r.count.down).toBe(8);
    expect(b.ladders![0]!.inner).toBeNull();
    expect(r.inside).toBeGreaterThan(0);
  });

  it('plot přeleze za 8 taktů bez žebříku', () => {
    const { b, f } = lone(fortOf('fence'));
    const r = crossing(b, f, 2000);
    expect(r.count).toEqual({ carry: expect.any(Number), up: 8 });
    expect(b.ladders ?? []).toEqual([]);
    expect(b.breaches).toEqual([]);
    expect(r.inside).toBeGreaterThan(0);
  });

  it('nejrychlejší postup: u palisády žebřík, u brány palisády sekání (3 h < 4 h žebříku)', () => {
    const wall = lone(palisade(false));
    run(wall.b, wall.f, 30);
    expect(fighter(wall.b, 'a:0').climb?.phase).toBe('make');
    const f = field([palisade(true)], forestSouth);
    const b = battle({
      attackers: Array.from({ length: 4 }, (_, i) => attacker(i, { x: 0, z: -60 })),
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    run(b, f, 400);
    expect(b.closedGates).toHaveLength(1);
    expect(b.breaches.map((x) => x.spot)).toEqual(['gate']);
    expect(b.ladders ?? []).toEqual([]);
  });

  it('bez lesa žebřík nevyrobí – prolamuje jako dosud', () => {
    const f = field([palisade(false)]);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -50 })],
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    run(b, f, 30);
    expect(fighter(b, 'a:0').state).toBe('breach');
  });
});

describe('postup zvolený hráčem (Martin 8. 11. 2026 – „ano“)', () => {
  it('skupina s rozkazem sekat u palisády prolamuje, i když les je blízko', () => {
    const f = field([palisade(false)], forestSouth);
    const s = campaign({ members: [member(1, 0, false)] });
    expect(setGroupAssault(s, 0, 'cut')).toBe(true);
    expect(s.groups[0]!.assault).toBe('cut');
    // v boji na doslech velitele (zde sám velitel skupiny)
    s.battle = battle({
      attackers: [attacker(0, { x: 0, z: -50 })],
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
      commander: 0,
    });
    // zrušení volby – zase nejrychlejší
    expect(setGroupAssault(s, 0, null)).toBe(true);
    expect(s.groups[0]!.assault).toBeUndefined();
    expect(s.battle.groups[0]!.assault).toBeUndefined();
    expect(setGroupAssault(s, 0, 'cut')).toBe(true);
    expect(s.battle.groups[0]!.assault).toBe('cut');
    run(s.battle, f, 30);
    expect(fighter(s.battle, 'a:0').state).toBe('breach');
    expect(s.battle.ladders ?? []).toEqual([]);
    // velitel u stěny neveli (prolamuje) – volbu skupina neslyší
    expect(setGroupAssault(s, 0, 'ladder')).toBe(false);
  });

  it('skupina s rozkazem žebříky leze i u brány, kde je sekání rychlejší', () => {
    const f = field([palisade(true)], forestSouth);
    const b = battle({
      attackers: Array.from({ length: 4 }, (_, i) => attacker(i, { x: 0, z: -60 })),
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    b.groups[0]!.assault = 'ladder';
    run(b, f, 400);
    expect(b.closedGates).toHaveLength(1);
    expect(b.breaches).toEqual([]);
    expect(b.ladders?.length ?? 0).toBeGreaterThan(0);
  });
});

/** Muž před hradbou s žebříkem; obránce `o` 2,2 m za vrcholem žebříku, jakmile žebřík stojí. */
function duel(o: { strength: number; seed?: number }): {
  b: BattleState;
  f: BattleField;
  onClimber: { tick: number; hit: number; phase: string | undefined; pos: Pos }[];
  onGuard: number[];
} {
  const f = field([palisade(false)], forestSouth);
  const b = battle({
    attackers: [attacker(0, { x: 0, z: -40 })],
    defenders: [defender(1, { x: 20, z: 20 }, { atHouseOnly: true, strength: o.strength })],
  });
  fighter(b, 'a:0').ladder = true;
  const onClimber: { tick: number; hit: number; phase: string | undefined; pos: Pos }[] = [];
  const onGuard: number[] = [];
  let placed = false;
  let lastA = 100;
  let lastD = 100;
  run(
    b,
    f,
    1500,
    (t) => {
      const a = fighter(b, 'a:0');
      const d = fighter(b, 'd:1');
      const l = b.ladders?.[0];
      if (!placed && l) {
        // obránce 2,2 m dovnitř od vrcholu – na patu (3,2 m) nedosáhne, na vrchol ano
        const nx = l.top.x - l.foot.x;
        const nz = l.top.z - l.foot.z;
        d.pos = { x: l.top.x + nx * 2.2, z: l.top.z + nz * 2.2 };
        d.home = { ...d.pos };
        placed = true;
      }
      if (a.health < lastA)
        onClimber.push({ tick: t, hit: lastA - a.health, phase: a.climb?.phase, pos: a.pos });
      if (d.health < lastD) onGuard.push(lastD - d.health);
      lastA = a.health;
      lastD = d.health;
    },
    o.seed,
  );
  return { b, f, onClimber, onGuard };
}

describe('souboj u žebříku (Obrana bez násobku 4; Martin – „A“)', () => {
  it('lezec nahoře bojuje na půl síly a každá rána obránce na něj padne', () => {
    // obránce se silou 1 (rána 10 > čekaný pád 20 ÷ 3) žebřík neshazuje, bije
    const onGuard: number[] = [];
    for (const seed of [7, 8, 9]) {
      const run = duel({ strength: 1, seed });
      const { b, onClimber } = run;
      expect(onClimber.length).toBeGreaterThan(3);
      for (const h of onClimber) expect(h.hit).toBeCloseTo(10, 6);
      // žádná rána nepadla mimo – po 2 s (8 taktů) jedna za druhou
      for (let i = 1; i < onClimber.length; i++) {
        expect(onClimber[i]!.tick - onClimber[i - 1]!.tick).toBe(8);
      }
      // nahoru se nedostal – leží
      expect(fighter(b, 'a:0').state).toBe('down');
      expect(b.ladders![0]!.inner).toBeNull();
      onGuard.push(...run.onGuard);
    }
    // lezec 0,4 × 0,5 – rána 2 (zda padne, los 1 : 1)
    expect(onGuard.length).toBeGreaterThan(0);
    for (const h of onGuard) expect(h).toBeCloseTo(2, 6);
  });

  it('slabší obránce žebřík s lezcem shazuje (1 : 3), lezec ztratí 20 a opírá znovu', () => {
    let falls = 0;
    for (const seed of [7, 8, 9]) {
      const { b, onClimber } = duel({ strength: 0.4, seed });
      const fallen = onClimber.filter((h) => h.phase === 'lean');
      for (const h of fallen) {
        expect(h.hit).toBeCloseTo(20, 6);
        expect(h.pos).toEqual(b.ladders![0]!.foot);
      }
      falls += fallen.length;
    }
    expect(falls).toBeGreaterThan(0);
  });

  it('los shození: s lezcem 1 : 3, prázdný 1 : 2', () => {
    expect(pushLadder(true, { next: () => 0.33 })).toBe(true);
    expect(pushLadder(true, { next: () => 0.34 })).toBe(false);
    expect(pushLadder(false, { next: () => 0.49 })).toBe(true);
    expect(pushLadder(false, { next: () => 0.5 })).toBe(false);
    const rng = createRandom(42);
    let n = 0;
    for (let i = 0; i < 3000; i++) if (pushLadder(true, rng)) n++;
    expect(n / 3000).toBeGreaterThan(0.31);
    expect(n / 3000).toBeLessThan(0.36);
  });

  it('dva žebříky blíž než 1 m nejdou', () => {
    const f = field([palisade(false)]);
    const bf = f.forts[0]!;
    const shape = bf.shapes[Math.floor(bf.shapes.length / 2)]!;
    const from = { x: shape.mid[0] * 2, z: shape.mid[1] * 2 };
    const top = ladderSpot(bf, shape.index, from, [])!;
    const taken = [
      {
        key: 'x',
        fort: 0,
        segment: shape.index,
        foot: top,
        top,
        inner: null,
        climber: null,
        up: true,
      },
    ];
    const next = ladderSpot(bf, shape.index, from, taken)!;
    expect(dist2(next, top)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(dist2(next, top)).toBeLessThan(1.5 * 1.5);
  });
});

describe('únava po valu (Obrana bez násobku 5)', () => {
  it('po příkopu a valu síla × 0,85, za 120 taktů zpět', () => {
    const f = field([fortOf('rampart')]);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -50 })],
      defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    const a = fighter(b, 'a:0');
    let start = -1;
    const seen: { t: number; s: number }[] = [];
    run(b, f, 400, (t) => {
      if (start < 0 && a.fatigue) start = t;
      if (start > 0) seen.push({ t: t - start, s: fighterStrength(a, b) });
    });
    expect(start).toBeGreaterThan(0);
    const at = (dt: number): number => seen.find((x) => x.t === dt)!.s;
    expect(at(0)).toBeCloseTo(0.4 * 0.85, 9);
    expect(at(60)).toBeCloseTo(0.4 * 0.925, 9);
    expect(at(120)).toBeCloseTo(0.4, 9);
    expect(a.fatigue).toBeUndefined();
  });
});

describe('bitva se žebříky po kouscích (Review Focus 4)', () => {
  it('stejný výsledek po kouscích taktů 1 / 7 / 40 přes JSON jako vcelku', () => {
    // plán hradeb Úloha 14: šest mužů by palisádu s ochozem nejrychleji vypálilo (les do 100 m) –
    // test žebříků si postup vynutí rozkazem skupiny
    const start = (): BattleState => {
      const b = battle({
        attackers: Array.from({ length: 6 }, (_, i) => attacker(i, { x: i * 3 - 8, z: -45 })),
        defenders: [
          defender(1, { x: 0, z: -26 }, { strength: 0.4 }),
          defender(2, { x: 4, z: -26 }, { strength: 1 }),
          defender(3, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 }),
        ],
      });
      b.groups[0]!.assault = 'ladder';
      return b;
    };
    const f = field([fortOf('walkway')], forestSouth);
    const TICKS = 900;
    const whole = start();
    for (let t = 1; t <= TICKS; t++) battleTick(whole, f, tickRandom(7, t, 'battle'));
    expect(whole.ladders?.length ?? 0).toBeGreaterThan(0);
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
