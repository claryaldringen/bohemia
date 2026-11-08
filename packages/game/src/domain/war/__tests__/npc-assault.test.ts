import { describe, expect, it } from 'vitest';
import type { Fortification } from '../../village/fortification/types';
import type { BattleField, BattleState } from '../battle';
import type { CampaignState } from '../campaign-types';
import { outward } from '../ladders';
import type { Pos } from '../march-grid';
import { approachStep, fastestApproach } from '../npc-assault';
import { npcIntents } from '../npc-commander';
import { dist2 } from '../orders';
import { WAR } from '../rules-war';
import { occupied, wallPosts } from '../wall-defense';
import {
  attacker,
  battle,
  DAY,
  defender,
  field,
  fighter,
  forestSouth,
  fortOf,
  palisade,
  run,
} from './battle-fixtures';
import { campaign, worldOf } from './campaign-fixtures';

// NPC velitel u hradby (fortifications.md – Obrana bez násobku, NPC velitel; plán hradeb –
// Úloha 20): nejrychlejší postup přes opevnění a kdy hradbu napadne; skupina „držet místo“ za
// hradbu nechodí.

/** Les 15 m jižně od palisády (políčka y < 61 – z pod −45 m): žebřík je rychlejší než oheň. */
const forestNear = (_tx: number, ty: number): boolean => ty < 61;
const FROM: Pos = { x: 0, z: -60 };
const TARGET = { villageId: 'hradek', name: 'Hrádek', cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } };

/** Boj u opevnění: `men` útočníků jižně (síla 0,4, velí první), obránci na stanovištích. */
function siege(
  f: BattleField,
  men: number,
  posts: readonly Pos[],
  defenderStrength = 0.4,
): BattleState {
  return battle({
    attackers: Array.from({ length: men }, (_, i) =>
      attacker(i, { x: (i % 10) * 2 - 9, z: -60 - Math.floor(i / 10) * 2 }),
    ),
    defenders: posts.map((p, i) => defender(i + 1, p, { post: p, strength: defenderStrength })),
    commander: 0,
  });
}

/** Tažení NPC velitele ve fázi nájezdu s bojem `b`. */
function raiding(b: BattleState): CampaignState {
  return { ...campaign({ liveCommand: false, target: TARGET }), phase: 'raiding', battle: b };
}

/** Úsek opevnění, jehož střed je nejblíž bodu. */
function segmentNear(f: BattleField, p: Pos): number {
  const shapes = f.forts[0]!.shapes;
  let best = shapes[0]!;
  for (const s of shapes) {
    const d = (q: typeof s): number => dist2({ x: q.mid[0], z: q.mid[1] }, p);
    if (d(s) < d(best)) best = s;
  }
  return best.index;
}

describe('nejrychlejší postup přes hradbu (fastestApproach)', () => {
  it('dlouhá palisáda s 6 obránci → žebříky na neobsazeném místě; NPC napadne', () => {
    const f = field([fortOf('palisade')], forestNear);
    const b = siege(f, 10, wallPosts(f.forts, 6));
    const way = fastestApproach(f, b, 10, FROM)!;
    expect(way.method).toBe('ladder');
    // výroba 4 h + do lesa a zpět ≈ 3 h + výstup ≈ 4 h – pod ohněm (12 h) i 1 herním dnem
    expect(way.hours).toBeGreaterThan(8);
    expect(way.hours).toBeLessThan(12);
    const bf = f.forts[0]!;
    const n = outward(bf, bf.shapes.find((s) => s.index === way.segment)!.line);
    const top = { x: way.at.x - n.x, z: way.at.z - n.z };
    expect(occupied(bf, top, b.fighters)).toBe(false);
    // 10 × 0,4 = 4 ≥ 1,5 × 6 × 0,4 = 3,6 → velitel vede skupinu k místu žebříků – přes bod 4 m
    // dál od hradby (ne podél ní)
    const leader = fighter(b, 'a:0').pos;
    const lead = fastestApproach(f, b, 10, leader)!;
    const stage = approachStep(f, leader, lead);
    expect(Math.sqrt(dist2(stage, lead.at))).toBeCloseTo(4, 6);
    expect(npcIntents(raiding(b), worldOf(), f)).toEqual([
      { kind: 'march', to: { cell: TARGET.cell, pos: stage } },
    ]);
    // u místa napadne nejbližšího obránce
    fighter(b, 'a:0').pos = { ...lead.at };
    const [intent] = npcIntents(raiding(b), worldOf(), f);
    expect(intent?.kind).toBe('strike');
  });

  it('bez lesa: s dřívím vsi oheň (12 h), bez otepí odkopat (20 h) – jako v boji', () => {
    const bare = field([fortOf('palisade')]);
    const f: BattleField = { ...bare, fuel: [{ x: 0, z: 0 }] };
    const way = fastestApproach(f, siege(f, 10, wallPosts(f.forts, 6)), 10, FROM)!;
    expect(way.method).toBe('burn');
    expect(way.hours).toBeCloseTo(16 / 4 + 8, 6);
    const dig = fastestApproach(bare, siege(bare, 10, wallPosts(bare.forts, 6)), 10, FROM)!;
    expect(dig.method).toBe('dig');
    expect(dig.hours).toBeCloseTo(80 / 4, 6);
  });

  it('roštová plně obsazená bez mezery → podkop 5 dní > 1 den → vezme, co je venku', () => {
    const f = field([fortOf('crib')], forestNear);
    const posts = wallPosts(f.forts, 100);
    // silnější vojsko (≥ 1,5 × obránci) – nenapadne jen kvůli délce postupu
    const men = Math.ceil((1.5 * posts.length * 0.1) / 0.4) + 1;
    const b = siege(f, men, posts, 0.1);
    const way = fastestApproach(f, b, men, FROM)!;
    expect(way.method).toBe('mine');
    expect(way.hours).toBeCloseTo(480 / 4, 6);
    expect(way.hours).toBeGreaterThan(WAR.npc.maxAssaultHours);
    expect(npcIntents(raiding(b), worldOf(), f)).toEqual([{ kind: 'plunder' }]);
  });

  it('mezera po průlomu → jde mezerou (dřívější průlom i průlom v boji)', () => {
    const south = (fort: Fortification, f: BattleField): Fortification => {
      const k = segmentNear(f, { x: 0, z: -30 });
      return {
        ...fort,
        segments: fort.segments.map((s) => (s.index === k ? { ...s, breachedDay: DAY - 1 } : s)),
      };
    };
    const plain = field([fortOf('palisade')], forestSouth);
    const f = field([south(fortOf('palisade'), plain)], forestSouth);
    const k = segmentNear(f, { x: 0, z: -30 });
    const way = fastestApproach(f, siege(f, 10, wallPosts(f.forts, 6)), 10, FROM)!;
    expect(way).toMatchObject({ method: 'open', segment: k, hours: 0 });
    // průlom vojska v tomto boji
    const b = siege(plain, 10, wallPosts(plain.forts, 6));
    b.breaches.push({
      key: `0:${k}:wall`,
      fort: 0,
      segment: k,
      spot: 'wall',
      at: { x: 0, z: -31 },
      method: 'cut',
      phase: 'done',
      need: { fill: 0, fuel: 0, burn: 0, work: 96 },
      progress: { done: 96, required: 96, breached: true },
    });
    expect(fastestApproach(plain, b, 10, FROM)).toMatchObject({ method: 'open', segment: k });
  });

  it('rozdělaný průlom uložený před Úlohou 14 (bez fází) – odhad projde, stav se nemění', () => {
    const f = field([fortOf('palisade')], forestNear);
    const b = siege(f, 10, wallPosts(f.forts, 6));
    const k = segmentNear(f, { x: 0, z: -30 });
    b.breaches.push({
      key: `0:${k}:wall`,
      fort: 0,
      segment: k,
      spot: 'wall',
      at: { x: 0, z: -31 },
      progress: { done: 90, required: 96, breached: false },
    } as unknown as BattleState['breaches'][number]);
    const before = JSON.stringify(b);
    expect(fastestApproach(f, b, 10, FROM)).not.toBeNull();
    expect(JSON.stringify(b)).toBe(before);
  });

  it('slabší vojsko než 1,5 × obránci → obrat; ves bez hradby se silnějším vojskem napadne', () => {
    const f = field([]);
    const posts = [-20, -10, 0, 10, 20, 30].map((x) => ({ x, z: 0 }));
    expect(npcIntents(raiding(siege(f, 8, posts)), worldOf(), f)).toEqual([
      { kind: 'turn-back', reason: 'order' },
    ]);
    const [intent] = npcIntents(raiding(siege(f, 9, posts)), worldOf(), f);
    expect(intent?.kind).toBe('strike');
  });

  it('k místu za rohem velitel obejde hradbu – napřed od ní ven, pak kolem, ne přes ni', () => {
    const f = field([fortOf('palisade')], forestNear);
    const way = {
      fort: 0,
      segment: segmentNear(f, { x: 0, z: -30 }),
      at: { x: 0, z: -31 },
      method: 'cut' as const,
      hours: 24,
    };
    // u západní hradby – napřed od ní ven (dál než nejvzdálenější roh + 5 m)
    const out = approachStep(f, { x: -31, z: 0 }, way);
    expect(Math.sqrt(dist2(out, f.forts[0]!.center))).toBeGreaterThan(40);
    expect(out.x).toBeLessThan(-31);
    // z kruhu kolem – bod, kam vidí bez hradby, blíž k místu
    const around = approachStep(f, out, way);
    expect(around.z).toBeLessThan(out.z);
    expect(Math.sqrt(dist2(around, way.at))).toBeLessThan(Math.sqrt(dist2(out, way.at)));
    // u místa rovnou k němu
    expect(approachStep(f, { x: 1, z: -34 }, way)).toEqual(way.at);
  });

  it('klešťová brána: velitel stojí před ústím uličky, žebříky ne přes ramena', () => {
    const fort = palisade(true);
    fort.gates = [{ ...fort.gates[0]!, pincerDay: 0 }];
    const f = field([fort]);
    const b = siege(f, 10, wallPosts(f.forts, 6));
    const way = fastestApproach(f, b, 10, FROM)!;
    // brána palisády prosekne za 12 ÷ 4 = 3 h – vrata na konci uličky, velitel před ústím venku
    expect(way.method).toBe('cut');
    expect(way.hours).toBeCloseTo(12 / 4, 6);
    expect(way.at.x).toBeCloseTo(0, 6);
    expect(way.at.z).toBeCloseTo(-31, 6);
    // jeden muž: brána 12 h, žebřík z lesa u hradby ≈ 10 h – nejblíž bráně, ale ne u ramen
    // (ulička 2 m + rameno 5,5 m + 1 m od středu brány) ani na sousedním úseku
    const g = fort.gates[0]!;
    const near = field([fort], forestNear);
    const ladder = fastestApproach(near, siege(near, 1, []), 1, { x: 0, z: -40 })!;
    expect(ladder.method).toBe('ladder');
    expect(Math.abs(ladder.at.x - g.x)).toBeGreaterThanOrEqual(8.5 - 1e-6);
    expect(Math.abs(ladder.at.x - g.x)).toBeLessThan(10);
  });

  it('bez mužů není postup; stejný výsledek při opakování (determinismus)', () => {
    const f = field([fortOf('palisade')], forestNear);
    const b = siege(f, 10, wallPosts(f.forts, 6));
    expect(fastestApproach(f, b, 0, FROM)).toBeNull();
    expect(fastestApproach(f, b, 10, FROM)).toEqual(fastestApproach(f, b, 10, FROM));
  });
});

describe('„držet místo“ u hradby (plán hradeb, Úloha 20 – návrh Clauda)', () => {
  it('cíl za palisádou, na který nedosáhne → místo neopustí, hradbu nepřeleze ani neprolomí', () => {
    const f = field([fortOf('palisade')], forestSouth);
    const hold = { x: 0, z: -40 };
    const b = battle({
      attackers: [attacker(0, hold)],
      defenders: [defender(1, { x: 0, z: -20 })],
      orders: { 0: 'hold-place' },
      holdAt: { 0: hold },
    });
    let left = false;
    run(b, f, 400, () => {
      const a = fighter(b, 'a:0');
      if (a.state !== 'fight' || a.aim !== null) left = true;
      if (dist2(a.pos, hold) > WAR.holdPlaceM * WAR.holdPlaceM) left = true;
    });
    expect(left).toBe(false);
  });

  it('lučištník střílí na obránce na ochozu – na toho dosáhne', () => {
    const f = field([fortOf('walkway')], forestSouth);
    const hold = { x: 0, z: -55 };
    const post = { x: 0, z: -29 };
    const b = battle({
      attackers: [attacker(0, hold, { bowSkill: 60 })],
      defenders: [defender(1, post, { post, onWall: true })],
      orders: { 0: 'hold-place' },
      holdAt: { 0: hold },
    });
    fighter(b, 'a:0').bow = true;
    let aimed = false;
    run(b, f, 40, () => {
      if (fighter(b, 'a:0').aim === 'd:1') aimed = true;
    });
    expect(aimed).toBe(true);
    expect(fighter(b, 'a:0').state).toBe('fight');
  });
});
