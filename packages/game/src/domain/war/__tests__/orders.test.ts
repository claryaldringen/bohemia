import { describe, expect, it } from 'vitest';
import { commandFighter } from '../battle';
import { dist2, setGroupOrder } from '../orders';
import { WAR } from '../rules-war';
import { campaign, member } from './campaign-fixtures';
import { attacker, battle, defender, field, fighter, run } from './battle-fixtures';

// Rozkazy skupin (war.md – Boj – Skupiny, Změna rozkazu).

const d = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.sqrt(dist2(a, b));

describe('rozkazy skupin (war.md – Boj – Skupiny)', () => {
  it('držet se velitele – jdou s ním a na ostatní neútočí', () => {
    const f = field();
    const b = battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, strength: 2 }),
        ...[1, 2, 3].map((i) => attacker(i, { x: 2 * i, z: 0 }, { group: 1 })),
      ],
      defenders: [defender(1, { x: 120, z: 60 }, { atHouseOnly: true, strength: 0.1 })],
      orders: { 1: 'follow-leader' },
      commander: 0,
      live: true,
    });
    commandFighter(b, 'a:0', { goal: { x: 0, z: 80 } });
    run(b, f, 200);
    const lead = fighter(b, 'a:0');
    expect(d(lead.pos, { x: 0, z: 80 })).toBeLessThan(1);
    for (const i of [1, 2, 3]) {
      const m = fighter(b, `a:${i}`);
      expect(d(m.pos, lead.pos)).toBeLessThan(8);
      expect(m.aim).toBeNull();
    }
    expect(fighter(b, 'd:1').health).toBe(100);
  });

  it('držet se velitele – napadnou toho, kdo útočí na velitele', () => {
    const f = field();
    const b = battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, strength: 2 }),
        attacker(1, { x: 4, z: 0 }, { group: 1 }),
      ],
      defenders: [defender(1, { x: -2, z: 0 })],
      orders: { 1: 'follow-leader' },
      commander: 0,
      live: true,
    });
    run(b, f, 2);
    expect(fighter(b, 'd:1').aim).toBe('a:0');
    expect(fighter(b, 'a:1').aim).toBe('d:1');
  });

  it('útočit na vše – jdou i na nepřítele mimo dohled a srazí ho', () => {
    const f = field();
    const b = battle({
      attackers: [attacker(0, { x: 0, z: 0 }), attacker(1, { x: 2, z: 0 })],
      defenders: [defender(1, { x: 400, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
    });
    run(b, f, 1);
    expect(fighter(b, 'a:0').aim).toBe('d:1');
    run(b, f, 3000);
    expect(b.outcome).toBe('attackers');
    expect(fighter(b, 'd:1').state).toBe('down');
  });

  it('držet místo – nevzdálí se víc než 30 m a vzdálené nehoní', () => {
    const f = field();
    const anchor = { x: 0, z: -35 };
    const b = battle({
      attackers: [attacker(0, anchor, { line: true, strength: 2 })],
      defenders: [
        defender(1, { x: 0, z: 0 }),
        defender(2, { x: 100, z: -35 }, { houseGroup: 1, atHouseOnly: true, strength: 0.1 }),
      ],
      orders: { 0: 'hold-place' },
    });
    let farthest = 0;
    run(b, f, 2000, () => {
      farthest = Math.max(farthest, d(fighter(b, 'a:0').pos, anchor));
      expect(fighter(b, 'a:0').aim).not.toBe('d:2');
    });
    expect(farthest).toBeLessThanOrEqual(WAR.holdPlaceM + 1e-6);
    expect(fighter(b, 'd:1').state).toBe('down');
    expect(fighter(b, 'd:2').health).toBe(100);
  });
});

describe('změna rozkazu (war.md – Změna rozkazu)', () => {
  it('před bitvou kdykoli, v boji jen do 30 m od velitele', () => {
    const s = campaign({
      members: [member(1, 0, true), member(2, 1, false), member(11, 1, false)],
    });
    expect(setGroupOrder(s, 1, 'hold-place', { x: 5, z: 5 })).toBe(true);
    expect(s.groups[1]!.holdAt).toEqual({ x: 5, z: 5 });
    s.battle = battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, strength: 2 }),
        attacker(1, { x: 50, z: 0 }, { group: 1 }),
        attacker(2, { x: 52, z: 0 }, { group: 1 }),
      ],
      defenders: [defender(1, { x: 900, z: 0 })],
      orders: { 1: 'hold-place' },
      commander: 0,
      live: true,
    });
    expect(setGroupOrder(s, 1, 'attack-all', null)).toBe(false);
    expect(s.groups[1]!.order).toBe('hold-place');
    fighter(s.battle, 'a:0').pos = { x: 25, z: 0 };
    expect(setGroupOrder(s, 1, 'attack-all', null)).toBe(true);
    expect(s.groups[1]!.order).toBe('attack-all');
    expect(s.groups[1]!.holdAt).toBeUndefined();
    expect(s.battle.groups.find((g) => g.side === 'attack' && g.id === 1)!.order).toBe(
      'attack-all',
    );
  });
});
