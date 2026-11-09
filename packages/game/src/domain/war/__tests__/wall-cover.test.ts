import { describe, expect, it } from 'vitest';
import { battleTick, orderDefenderBreakout, type BattleField, type BattleState } from '../battle';
import type { Pos } from '../march-grid';
import { refugeRout } from '../rout';
import { WAR } from '../rules-war';
import { tickRandom, TICKS_PER_SECOND } from '../ticks';
import { wallPosts, withinWalls } from '../wall-defense';
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

// Kryt pod palbou, bod zlomu jen v útoku, chaos a probíjení (fortifications.md – Obrana bez násobku
// 3; Martin 9. 11. 2026). Opevnění 60 × 60 m kolem počátku, jižní hradba na z = −30 (brána
// palisády `palisade(true)` uprostřed), les jižně od z ≈ −75 m.

/** Palisáda s ochozem a bránou na jihu. */
const walkwayGate = (): ReturnType<typeof palisade> => ({ ...palisade(true), kind: 'walkway' });

/** Obránci na stanovištích hradby (`wallPosts`), na ochozu. */
function wallMen(
  f: BattleField,
  men: number,
  o: { strength?: number } = {},
): ReturnType<typeof defender>[] {
  return wallPosts(f.forts, men).map((p, i) =>
    defender(i + 1, p, { post: p, onWall: true, strength: o.strength ?? 0.4 }),
  );
}

/** Lučištníci (muži rodu) držící místo 40 m jižně od hradby. */
function archers(n: number, skill: number): ReturnType<typeof attacker>[] {
  return Array.from({ length: n }, (_, i) =>
    attacker(i, { x: -10 + 4 * i, z: -70 }, { line: true, strength: 2, bowSkill: skill }),
  );
}

const defenders = (b: BattleState): BattleState['fighters'] =>
  b.fighters.filter((f) => f.side === 'defend');

describe('kryt pod palbou', () => {
  it('ostřelování bez útoku obránce nezlomí – kryjí se a šípy zasáhnou jen výjimečně', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({
      attackers: archers(6, 60),
      defenders: wallMen(f, 12),
      orders: { 0: 'hold-place' },
      holdAt: { 0: { x: 0, z: -70 } },
    });
    let covered = 0;
    // půl hodiny ostřelování
    run(b, f, 30 * 60 * TICKS_PER_SECOND, () => {
      covered = Math.max(covered, defenders(b).filter((d) => d.cover).length);
    });
    expect(b.outcome).toBe('ongoing');
    expect(b.underFire?.[0]).toBeDefined();
    expect(covered).toBeGreaterThan(0);
    // bod zlomu nenastal – ztráty z ostřelování se nepočítají
    expect(b.routed).toBeUndefined();
    const down = defenders(b).filter((d) => d.state === 'down');
    expect(down.every((d) => d.shotDown)).toBe(true);
    const hits = defenders(b).reduce((n, d) => n + (d.hits ?? 0), 0);
    // šest lučištníků střílí půl hodiny (≈ 2 700 šípů) – v krytu jich padne jen pár desítek
    expect(hits).toBeLessThan(60);
  });

  it('padlí ostřelováním do bodu zlomu nejdou, ztráty v útoku ano', () => {
    const f = field([walkwayGate()], forestSouth);
    const make = (shot: boolean): BattleState => {
      const b = battle({
        attackers: [attacker(0, { x: 0, z: 70 })],
        defenders: wallMen(f, 10),
        orders: { 0: 'hold-place' },
      });
      for (const d of defenders(b).slice(0, 5)) {
        d.state = 'down';
        d.health = 0;
        if (shot) d.shotDown = true;
      }
      battleTick(b, f, tickRandom(7, 1, 'battle'));
      return b;
    };
    expect(make(true).routed).toBeUndefined();
    expect(make(false).routed).toEqual([0]);
  });

  it('po žebříku se obránci vrátí na místo a brání ho, ostatní zůstanou v krytu', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({
      attackers: [
        ...archers(4, 60),
        ...[4, 5, 6, 7].map((i) => attacker(i, { x: i - 6, z: -72 }, { group: 1, strength: 1 })),
      ],
      defenders: wallMen(f, 12),
      orders: { 0: 'hold-place', 1: 'attack-all' },
      holdAt: { 0: { x: 0, z: -70 } },
    });
    let defended = false;
    let elsewhereCovered = false;
    run(b, f, 4000, () => {
      for (const l of b.ladders ?? []) {
        const c = l.climber === null ? undefined : fighter(b, l.climber);
        if (!c?.climb || c.climb.phase !== 'up') continue;
        const near = defenders(b).filter(
          (d) => d.state === 'fight' && Math.hypot(d.pos.x - l.top.x, d.pos.z - l.top.z) <= 2.5,
        );
        if (near.some((d) => !d.cover)) defended = true;
        if (defenders(b).some((d) => d.cover)) elsewhereCovered = true;
      }
    });
    expect(defended).toBe(true);
    expect(elsewhereCovered).toBe(true);
  });
});

describe('bod zlomu za hradbou – chaos', () => {
  /** Opevnění s bránou, 10 obránců, 5 padlých v útoku; útočníci „útočit na vše“ na severu. */
  function chaos(): { b: BattleState; f: BattleField } {
    const f = field([walkwayGate()], forestSouth);
    const b = battle({
      attackers: [0, 1, 2, 3, 4, 5].map((i) =>
        attacker(i, { x: i * 2 - 5, z: 70 }, { strength: 1 }),
      ),
      defenders: wallMen(f, 10),
    });
    const men = defenders(b);
    for (const d of men.slice(0, 5)) {
      d.state = 'down';
      d.health = 0;
    }
    men[5]!.health = 30;
    return { b, f };
  }

  it('brány se otevřou, zdraví utíkají branou do lesa, raněný se vzdá', () => {
    const { b, f } = chaos();
    battleTick(b, f, tickRandom(7, 1, 'battle'));
    expect(b.routed).toEqual([0]);
    expect(b.openedGates?.length).toBe(1);
    const men = defenders(b);
    expect(men[5]!.state).toBe('fled');
    expect(men[5]!.surrendered).toBe(true);
    expect(men.slice(6).every((d) => d.state === 'flee')).toBe(true);
    run(b, f, 3000);
    // kdo nebyl dohnán, utekl branou do lesa (ne vzdal se)
    const escaped = men.slice(6).filter((d) => d.state === 'fled' && !d.surrendered);
    expect(escaped.length).toBeGreaterThan(0);
    for (const d of escaped) expect(withinWalls(f.forts[0]!, d.pos)).toBe(false);
  });

  it('útočiště je dobyté, až je útočník uvnitř', () => {
    const { b, f } = chaos();
    let emptyTick: number | null = null;
    run(b, f, 20_000, (t) => {
      const any = defenders(b).some((d) => d.state === 'fight' || d.state === 'flee');
      if (!any && emptyTick === null) emptyTick = t;
    });
    expect(emptyTick).not.toBeNull();
    expect(b.outcome).toBe('attackers');
    expect(b.taken).toEqual([0]);
    expect(
      b.fighters.some(
        (a) => a.side === 'attack' && a.state === 'fight' && withinWalls(f.forts[0]!, a.pos),
      ),
    ).toBe(true);
  });

  it('bez brány a mezery jsou obránci odříznutí – vzdají se', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({ attackers: [attacker(0, { x: 0, z: 70 })], defenders: wallMen(f, 4) });
    defenders(b)[0]!.state = 'down';
    defenders(b)[1]!.state = 'down';
    run(b, f, 20);
    expect(
      defenders(b)
        .slice(2)
        .every((d) => d.state === 'fled' && d.surrendered),
    ).toBe(true);
  });

  it('po kouscích přes JSON = vcelku', () => {
    const whole = chaos();
    run(whole.b, whole.f, 1500);
    const parts = chaos();
    let b = parts.b;
    for (let t = 1; t <= 1500 && b.outcome === 'ongoing'; t++) {
      battleTick(b, parts.f, tickRandom(7, t, 'battle'));
      if (t % 7 === 0) b = JSON.parse(JSON.stringify(b)) as BattleState;
    }
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(whole.b)));
  });
});

describe('probíjení', () => {
  /** 10 obránců, 3 padlí v útoku (30 %); útočníci na severu daleko od jižní brány. */
  function siege(near: Pos | null): { b: BattleState; f: BattleField } {
    const f = field([walkwayGate()], forestSouth);
    const at = near ?? { x: 0, z: 70 };
    const b = battle({
      attackers: [0, 1, 2, 3].map((i) => attacker(i, { x: at.x + i, z: at.z }, { strength: 1 })),
      defenders: wallMen(f, 10),
      orders: { 0: 'hold-place' },
    });
    for (const d of defenders(b).slice(0, 3)) {
      d.state = 'down';
      d.health = 0;
    }
    return { b, f };
  }

  it('velitel obrany při 30 % ztrát vyvede skupinu volnou branou do lesa', () => {
    const { b, f } = siege(null);
    battleTick(b, f, tickRandom(7, 1, 'battle'));
    expect(b.breakouts).toEqual([
      expect.objectContaining({ fort: 0, segment: f.forts[0]!.fort.gates[0]!.segment }),
    ]);
    run(b, f, 4000);
    const men = defenders(b).slice(3);
    expect(men.every((d) => d.state === 'fled' && !d.surrendered)).toBe(true);
    for (const d of men) expect(d.pos.z).toBeLessThan(-60);
    expect(b.routed).toBeUndefined();
  });

  it('hlídanou branou se neprobíjí', () => {
    const { b, f } = siege({ x: -2, z: -45 });
    battleTick(b, f, tickRandom(7, 1, 'battle'));
    expect(b.breakouts).toBeUndefined();
  });

  it('záměr hráče „Probít se“ provede takt – bez ztrát jen na rozkaz', () => {
    const fresh = (): { b: BattleState; f: BattleField } => {
      const x = siege(null);
      for (const d of defenders(x.b)) {
        d.state = 'fight';
        d.health = 100;
      }
      return x;
    };
    const quiet = fresh();
    battleTick(quiet.b, quiet.f, tickRandom(7, 1, 'battle'));
    expect(quiet.b.breakouts).toBeUndefined();
    const { b, f } = fresh();
    b.breakoutOrder = { fort: 0 };
    battleTick(b, f, tickRandom(7, 1, 'battle'));
    expect(b.breakoutOrder).toBeUndefined();
    expect(b.breakouts?.[0]?.fort).toBe(0);
  });

  it('rozkaz „Probít se“ – jen s branou a před bodem zlomu', () => {
    const { b, f } = siege({ x: -2, z: -45 });
    expect(orderDefenderBreakout(b, f, 0, f.forts[0]!.fort.gates[0]!.segment)).toBe(true);
    expect(b.openedGates).toEqual([`0:${f.forts[0]!.fort.gates[0]!.segment}`]);
    expect(orderDefenderBreakout(b, f, 0, 999)).toBe(false);
    b.routed = [0];
    expect(orderDefenderBreakout(b, f, 0)).toBe(false);
  });
});

describe('lidé v dobytém útočišti', () => {
  it('zdraví dospělí utečou, děti, matky malých dětí, staří a ranění se vzdají', () => {
    const day = 100 * 365;
    const born = (years: number): number => day - years * 365 - 10;
    const people = [
      { id: 1, bornDay: born(30) },
      { id: 2, bornDay: born(28) },
      { id: 3, bornDay: born(3), motherId: 2 },
      { id: 4, bornDay: born(12), motherId: 1 },
      { id: 5, bornDay: born(WAR.rout.elderFromYears + 1) },
      { id: 6, bornDay: born(25), woundedUntil: day + 10 },
      { id: 7, bornDay: born(40) },
    ];
    const r = refugeRout(people, day, [1, 2, 3, 4, 5, 6]);
    expect(r.fled).toEqual([1]);
    expect(r.surrendered).toEqual([2, 3, 4, 5, 6]);
  });
});
