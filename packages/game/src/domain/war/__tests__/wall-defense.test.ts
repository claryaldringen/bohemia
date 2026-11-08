import { describe, expect, it } from 'vitest';
import { createRandom } from '../../landscape/random';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import type { TileCell } from '../../village/types';
import { bowShot, poseOf, shotChance, visibleAreaM2 } from '../aim';
import { battleTick, hitDamage, type BattleState, type Fighter } from '../battle';
import type { Defender } from '../defenders';
import type { Pos } from '../march-grid';
import { dist2 } from '../orders';
import { tickRandom } from '../ticks';
import {
  canStrikeAcross,
  crownAt,
  occupied,
  strikeReach,
  wallKindAt,
  wallPosts,
} from '../wall-defense';
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

// Obránci na hradbě (fortifications.md – Obrana bez násobku 2, 3, 6; Střelba a viditelná plocha;
// plán hradeb – Úloha 12): stanoviště, obsazení, přesun k žebříku, rány přes hradbu podle druhu.

/** Palisáda 5 × 5 políček (75 × 75 m, obvod ≈ 300 m) s branou na jihu a na severu. */
function ring300(kind: Fortification['kind'] = 'palisade'): Fortification {
  const cells: TileCell[] = [];
  for (let y = 62; y < 67; y++) for (let x = 62; x < 67; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: 128, cellSizeM: 15 });
  if ('error' in area) throw new Error(area.error);
  const outline = areaOutline(area, 'palisade');
  const south = addGate(outline, [], { x: 7.5, z: -30 });
  if (!Array.isArray(south)) throw new Error(south.error);
  const both = addGate(outline, south, { x: 7.5, z: 45 });
  if (!Array.isArray(both)) throw new Error(both.error);
  return {
    id: 1,
    grid: null,
    cells,
    kind,
    segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
    gates: both,
  };
}

/** Obránce na stanovišti `post` (na ochozu, je-li `onWall`). */
function posted(personId: number, post: Pos, onWall: boolean, o: Partial<Defender> = {}): Defender {
  return defender(personId, post, { post, ...(onWall ? { onWall: true as const } : {}), ...o });
}

/** Největší krok muže za takt během `ticks` taktů. */
function maxStep(b: BattleState, f: ReturnType<typeof field>, id: string, ticks: number): number {
  let best = 0;
  let last = { ...fighter(b, id).pos };
  run(b, f, ticks, () => {
    const p = fighter(b, id).pos;
    best = Math.max(best, Math.sqrt(dist2(p, last)));
    last = { ...p };
  });
  return best;
}

describe('stanoviště na hradbě (Obrana bez násobku 6)', () => {
  it('300 m obvodu a 20 mužů: 2 brány po 2, zbytek rovnoměrně ≈ po 17 m', () => {
    const f = field([ring300()]);
    const bf = f.forts[0]!;
    const perimeter = bf.shapes.reduce((a, s) => a + s.lengthM, 0);
    expect(perimeter).toBeGreaterThan(290);
    expect(perimeter).toBeLessThanOrEqual(300);
    const posts = wallPosts(f.forts, 20);
    expect(posts).toHaveLength(20);
    // první čtyři – u bran po dvou (1 m vlevo a vpravo, 1 m za branou)
    for (const g of bf.fort.gates) {
      expect(posts.slice(0, 4).filter((p) => dist2(p, g) <= 2 * 2)).toHaveLength(2);
    }
    // zbytek: 16 mužů, v každé mezeře mezi branami (východ, západ) 8 – po obvodu ≈ obvod ÷ 18;
    // vzdálenost k nejbližšímu sousedovi nejvýš tolik (na rohu vzdušnou čarou míň)
    const rest = posts.slice(4);
    expect(rest.filter((p) => p.x > 7.5)).toHaveLength(8);
    expect(rest.filter((p) => p.x < 7.5)).toHaveLength(8);
    const anchors = [...rest, ...bf.fort.gates.map((g) => ({ x: g.x, z: g.z }))];
    const nns = rest.map((p) =>
      Math.min(...anchors.filter((q) => q !== p).map((q) => Math.sqrt(dist2(p, q)))),
    );
    for (const nn of nns) {
      expect(nn).toBeGreaterThan(10);
      expect(nn).toBeLessThan(perimeter / 18 + 0.5);
    }
    // na rovné hradbě ≈ 16–17 m
    expect(Math.max(...nns)).toBeGreaterThan(15.5);
    // všechna stanoviště 1 m za čarou hradby (stěna je na −30 a 45 m; zkosené rohy dál)
    for (const p of posts) {
      const edge = Math.min(
        Math.abs(p.x + 30),
        Math.abs(p.x - 45),
        Math.abs(p.z + 30),
        Math.abs(p.z - 45),
      );
      expect(edge).toBeGreaterThan(0.5);
      expect(edge).toBeLessThan(3);
    }
  });

  it('nejvýš jeden obránce na 5 m – zbytek zůstane v záloze', () => {
    const f = field([ring300()]);
    // obvod stěn bitvy – čáry úseků (rohy zkosené)
    const perimeter = f.forts[0]!.shapes.reduce((a, s) => a + s.line.length, 0);
    expect(wallPosts(f.forts, 100)).toHaveLength(4 + Math.floor(perimeter / 5));
    expect(wallPosts(f.forts, 3)).toHaveLength(3);
    expect(wallPosts([], 5)).toEqual([]);
  });

  it('na ochozu a koruně stojí obránce nahoře, za palisádou a plotem na zemi', () => {
    for (const kind of ['walkway', 'crib', 'chamber'] as const) {
      const f = field([fortOf(kind)]);
      const posts = wallPosts(f.forts, 6);
      expect(posts.every((p) => crownAt(f.forts, p, f.day))).toBe(true);
    }
    for (const kind of ['palisade', 'fence'] as const) {
      const f = field([fortOf(kind)]);
      expect(wallPosts(f.forts, 6).some((p) => crownAt(f.forts, p, f.day))).toBe(false);
    }
    // střed opevnění (záloha) na hradbě není
    const f = field([fortOf('walkway')]);
    expect(crownAt(f.forts, { x: 0, z: 0 }, f.day)).toBe(false);
  });

  it('druh hradby se čte v místě', () => {
    const f = field([fortOf('walkway')]);
    const bf = f.forts[0]!;
    expect(wallKindAt(bf, bf.shapes[0]!.index, 1, f.day)).toBe('walkway');
    expect(wallKindAt(bf, 999, 1, f.day)).toBeNull();
  });
});

describe('obsazení a přesun obránců (Obrana bez násobku 6)', () => {
  it('místo je obsazené obráncem do 2,5 m za hradbou; venku před ní ne', () => {
    const f = field([fortOf('walkway')]);
    const bf = f.forts[0]!;
    const top = { x: 0, z: -30 };
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -80 })],
      defenders: [defender(1, { x: 1, z: -29 }), defender(2, { x: 10, z: -29 })],
    });
    expect(occupied(bf, top, b.fighters)).toBe(true);
    expect(occupied(bf, { x: 8, z: -30 }, b.fighters)).toBe(true);
    expect(occupied(bf, { x: 5, z: -30 }, b.fighters)).toBe(false);
    // obránce venku před hradbou úsek neobsazuje, ležící taky ne
    fighter(b, 'd:1').pos = { x: 0, z: -31.5 };
    expect(occupied(bf, top, b.fighters)).toBe(false);
    fighter(b, 'd:1').pos = { x: 0, z: -29 };
    fighter(b, 'd:1').state = 'down';
    expect(occupied(bf, top, b.fighters)).toBe(false);
  });

  it('neobsazeným úsekem lezec vyleze bez boje (obránce je na druhé straně)', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -45 })],
      defenders: [posted(1, { x: 0, z: 29 }, true)],
    });
    fighter(b, 'a:0').ladder = true;
    let fought = false;
    let inside = -1;
    let health = -1;
    run(b, f, 400, (t) => {
      const a = fighter(b, 'a:0');
      if (a.state === 'climb' && a.aim !== null) fought = true;
      if (inside < 0 && a.state === 'fight' && a.pos.z > -29) {
        inside = t;
        health = a.health;
      }
    });
    expect(inside).toBeGreaterThan(0);
    expect(fought).toBe(false);
    expect(health).toBe(100);
  });

  it('obránce se přesune k žebříku, kde je víc útočníků – po ochozu polovičním tempem', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({
      attackers: [attacker(0, { x: 10, z: -45 })],
      defenders: [posted(1, { x: 20, z: -29 }, true), posted(2, { x: -20, z: -29 }, true)],
    });
    fighter(b, 'a:0').ladder = true;
    const step = maxStep(b, f, 'd:1', 80);
    // 3,5 m/s ÷ 4 takty × 0,5
    expect(step).toBeGreaterThan(0.4);
    expect(step).toBeLessThanOrEqual(0.4375 + 1e-9);
    const l = b.ladders![0]!;
    expect(dist2(fighter(b, 'd:1').pos, l.top)).toBeLessThanOrEqual(2.5 * 2.5);
    expect(fighter(b, 'd:1').onWall).toBe(true);
    // druhý obránce zůstal na stanovišti – u žebříku už je obránců tolik jako útočníků
    expect(fighter(b, 'd:2').pos).toEqual({ x: -20, z: -29 });
  });

  it('za palisádou bez ochozu jde obránce k žebříku plným tempem', () => {
    const f = field([fortOf('palisade')], forestSouth);
    const b = battle({
      attackers: [attacker(0, { x: 10, z: -45 })],
      defenders: [posted(1, { x: 20, z: -29 }, false), posted(2, { x: -20, z: -29 }, false)],
    });
    fighter(b, 'a:0').ladder = true;
    const step = maxStep(b, f, 'd:1', 80);
    expect(step).toBeGreaterThan(0.8);
    expect(step).toBeLessThanOrEqual(0.875 + 1e-9);
  });

  it('přes nádvoří sleze z ochozu a jde po zemi plným tempem', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -45 })],
      defenders: [posted(1, { x: 0, z: 29 }, true)],
    });
    fighter(b, 'a:0').ladder = true;
    const step = maxStep(b, f, 'd:1', 60);
    expect(step).toBeGreaterThan(0.8);
    expect(fighter(b, 'd:1').onWall).toBeUndefined();
  });

  it('za útočníkem uvnitř obvodu sleze z ochozu; pak se na ochoz vrátí', () => {
    const f = field([fortOf('walkway')]);
    const b = battle({
      attackers: [attacker(0, { x: 0, z: -5 })],
      defenders: [posted(1, { x: 0, z: -29 }, true)],
    });
    run(b, f, 3);
    expect(fighter(b, 'd:1').onWall).toBeUndefined();
    expect(fighter(b, 'd:1').pos.z).toBeGreaterThan(-28);
    // útočník je zase daleko venku a jde prolamovat (bez lesa) – obránce se vrátí k hradbě nad
    // místo prolomení a vystoupí na ochoz
    fighter(b, 'a:0').pos = { x: 0, z: -300 };
    run(b, f, 20);
    expect(fighter(b, 'a:0').state).toBe('breach');
    expect(fighter(b, 'd:1').pos.z).toBeLessThan(-28);
    expect(fighter(b, 'd:1').onWall).toBe(true);
  });
});

describe('rány přes hradbu (Obrana bez násobku 2, 3)', () => {
  const man = (o: Partial<Fighter>): Fighter =>
    ({ id: 'x', side: 'defend', pos: { x: 0, z: 0 }, ...o }) as Fighter;
  const onWall = man({ onWall: true, pos: { x: 0, z: -29 } });
  const behind = man({ pos: { x: 0, z: -29 } });
  const foot = man({ side: 'attack', pos: { x: 0, z: -31 } });
  const far = man({ side: 'attack', pos: { x: 0, z: -69 } });

  it('tabulka „Kdo přes hradbu koho zasáhne“', () => {
    // bez hradby a plot – z obou stran
    for (const wall of [null, 'fence'] as const) {
      expect(canStrikeAcross(wall, behind, foot, 'melee')).toBe(true);
      expect(canStrikeAcross(wall, far, behind, 'ranged')).toBe(true);
    }
    // palisáda bez ochozu – nikdo, ven ani dovnitř
    expect(canStrikeAcross('palisade', behind, foot, 'melee')).toBe(false);
    expect(canStrikeAcross('palisade', behind, far, 'ranged')).toBe(false);
    expect(canStrikeAcross('palisade', far, behind, 'ranged')).toBe(false);
    for (const wall of ['walkway', 'crib', 'chamber'] as const) {
      // z ochozu: kameny k patě (do 3 m), ven střela 40 m
      expect(canStrikeAcross(wall, onWall, foot, 'melee')).toBe(true);
      expect(canStrikeAcross(wall, onWall, far, 'ranged')).toBe(true);
      expect(canStrikeAcross(wall, onWall, far, 'melee')).toBe(false);
      // zespodu: na obránce na ochozu jen střelou, za hradbou na nikoho
      expect(canStrikeAcross(wall, far, onWall, 'ranged')).toBe(true);
      expect(canStrikeAcross(wall, foot, onWall, 'melee')).toBe(false);
      expect(canStrikeAcross(wall, far, behind, 'ranged')).toBe(false);
      expect(canStrikeAcross(wall, behind, foot, 'melee')).toBe(false);
    }
  });

  it('z ochozu se hází do 15 m, kameny k patě zblízka; dole se nehází', () => {
    const at = (z: number): Fighter => man({ side: 'attack', pos: { x: 0, z } });
    expect(strikeReach(onWall, at(-31))).toBe('melee');
    expect(strikeReach(onWall, at(-40))).toBe('throw');
    expect(strikeReach(onWall, at(-43))).toBe('throw');
    expect(strikeReach(onWall, at(-50))).toBeNull();
    expect(strikeReach(behind, at(-40))).toBeNull();
    // muž rodu s lukem: pod 20 m hází, 20–60 m střílí
    const archer = man({ onWall: true, bow: true, pos: { x: 0, z: -29 } });
    expect(strikeReach(archer, at(-40))).toBe('throw');
    expect(strikeReach(archer, at(-69))).toBe('bow');
  });

  it('útočník na obránce na ochozu má menší šanci – předprseň 0,25 m²', () => {
    const f = field([fortOf('walkway')]);
    expect(poseOf(onWall, f)).toBe('parapet');
    expect(poseOf(onWall, f, {}, false)).toBe('standing');
    expect(poseOf(behind, f)).toBe('standing');
    expect(visibleAreaM2('parapet')).toBe(0.25);
    const r = 2;
    const covered = shotChance([{ id: 'x', side: 'defend', areaM2: 0.25 }], r);
    const open = shotChance([{ id: 'x', side: 'defend', areaM2: 0.85 }], r);
    expect(covered).toBeCloseTo((open * 0.25) / 0.85, 9);
  });

  it('za palisádou bez ochozu šíp ven nejde; z ochozu na útočníka 40 m ano', () => {
    for (const [kind, hits] of [
      ['palisade', false],
      ['walkway', true],
    ] as const) {
      const f = field([fortOf(kind)]);
      const b = battle({
        attackers: [attacker(0, { x: 0, z: -70 }, { strength: 0.1 })],
        defenders: [
          posted(1, { x: 0, z: -29 }, kind === 'walkway', {
            line: true,
            bow: true,
            bowSkill: 100,
            strength: 2,
          }),
        ],
        orders: { 0: 'hold-place' },
      });
      run(b, f, 200);
      expect(fighter(b, 'a:0').health < 100).toBe(hits);
    }
  });

  it('vesničan z ochozu shazuje kameny na prolamujícího u paty plným zásahem', () => {
    for (const [kind, onTop] of [
      ['walkway', true],
      ['palisade', false],
    ] as const) {
      const f = field([fortOf(kind)]);
      const b = battle({
        attackers: [attacker(0, { x: 0, z: -45 }, { health: 100 })],
        defenders: [posted(1, { x: 0, z: 0 }, false)],
      });
      run(b, f, 1);
      // obránce se postaví nad místo prolomení (1 m za hradbu)
      const at = b.breaches[0]!.at;
      const d = fighter(b, 'd:1');
      d.pos = { x: at.x, z: at.z + 2 };
      d.post = { ...d.pos };
      if (onTop) d.onWall = true;
      run(b, f, 120);
      const lost = 100 - fighter(b, 'a:0').health;
      if (onTop) {
        // kámen k patě plný zásah 4, hod dál než 3 m poloviční 2
        expect(lost).toBeGreaterThan(0);
        expect(lost % hitDamage(0.4, true)).toBeCloseTo(0, 9);
      } else {
        expect(lost).toBe(0);
      }
    }
  });

  it('Review Focus 5: v kruhu útočník a vlastní – smí trefit vlastního; jen vlastní – nestřílí', () => {
    // obránce na ochozu, nováček luku (kruh 2,7 m na 40 m); vedle útočníka bojuje vlastní muž
    const shooter = man({ id: 'd:1', onWall: true, bow: true, bowSkill: 0, pos: { x: 0, z: -29 } });
    const foe = man({ id: 'a:0', side: 'attack', state: 'fight', pos: { x: 0, z: -69 } });
    const own = man({ id: 'd:2', state: 'fight', pos: { x: 1, z: -69 } });
    const fighters = [shooter, foe, own];
    const f = field([fortOf('walkway')]);
    const pose = (x: Fighter): ReturnType<typeof poseOf> => poseOf(x, f, {}, false);
    const hit = { foe: 0, own: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const shot = bowShot(shooter, foe, fighters, pose, createRandom(seed));
      expect(shot.fired).toBe(true);
      if (shot.fired && shot.hit === 'a:0') hit.foe++;
      if (shot.fired && shot.hit === 'd:2') hit.own++;
    }
    expect(hit.own).toBeGreaterThan(0);
    expect(hit.foe).toBeGreaterThan(0);
    // útočník v kruhu není vidět (v podkopu – Úloha 14) – v kruhu jen vlastní: nestřílí
    const hidden = (x: Fighter): ReturnType<typeof poseOf> =>
      x.side === 'attack' ? 'underground' : pose(x);
    expect(bowShot(shooter, foe, fighters, hidden, createRandom(1))).toEqual({ fired: false });
  });
});

describe('bitva s obránci na hradbě po kouscích (Review Focus 4)', () => {
  it('stejný výsledek po kouscích taktů 1 / 7 / 40 přes JSON jako vcelku', () => {
    const f = field([palisade(true)], forestSouth);
    const walkway = field([{ ...palisade(true), kind: 'walkway' } as Fortification], forestSouth);
    for (const fld of [f, walkway]) {
      const posts = wallPosts(fld.forts, 8);
      const start = (): BattleState =>
        battle({
          attackers: Array.from({ length: 8 }, (_, i) => attacker(i, { x: i * 4 - 14, z: -50 })),
          defenders: posts.map((p, i) =>
            posted(i + 1, p, crownAt(fld.forts, p, fld.day), { strength: i % 3 === 0 ? 1 : 0.4 }),
          ),
        });
      const TICKS = 900;
      const whole = start();
      for (let t = 1; t <= TICKS; t++) battleTick(whole, fld, tickRandom(7, t, 'battle'));
      for (const chunk of [1, 7, 40]) {
        let b = start();
        for (let t = 1; t <= TICKS; t++) {
          battleTick(b, fld, tickRandom(7, t, 'battle'));
          if (t % chunk === 0) b = JSON.parse(JSON.stringify(b)) as BattleState;
        }
        expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(whole)));
      }
    }
  });
});
