import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, dayIndexOf } from '../../calendar';
import { village } from '../../village/__tests__/kin-fixtures';
import type { Fortification } from '../../village/fortification/types';
import { poseOf } from '../aim';
import { battleForts, battleTick, type BattleField, type BattleState } from '../battle';
import type { GroupAssault } from '../campaign-types';
import { MARCH_WATER, marchGrid, type Pos } from '../march-grid';
import { canAttack } from '../orders';
import { applyFortificationBreach } from '../raid-apply';
import { hoursPerTick, tickRandom } from '../ticks';
import {
  DAY,
  attacker,
  battle,
  defender,
  fighter,
  forestSouth,
  fortOf,
  land,
  palisade,
  run,
} from './battle-fixtures';

// Přechod hradby v boji (fortifications.md – Přechod hradby – Oheň, Podkop, S valem; plán hradeb
// Úloha 14): oheň, sekání, odkopání, podkop a zasypání se 4 muži na neobsazeném místě.

const SUMMER = dayIndexOf({ year: 500, month: 7, day: 1 });

/** Bojiště na louce; `day` (výchozí zimní `DAY` – vodní příkop zamrzlý), dříví vsi `fuel`. */
function fieldAt(
  forts: Fortification[],
  o: { forest?: (tx: number, ty: number) => boolean; day?: number; fuel?: Pos[] } = {},
): BattleField {
  const landscape = land(o.forest);
  const day = o.day ?? DAY;
  const v = village([], [], { fortifications: forts, lastDay: day });
  return {
    grid: marchGrid(landscape, null, v, { day }),
    geo: landscape,
    forts: battleForts(landscape, forts),
    day,
    hoursPerTick: hoursPerTick(OFFICIAL_WORLD),
    ...(o.fuel ? { fuel: o.fuel } : {}),
  };
}

/** Palisáda na valu; volitelně s napuštěným vodním příkopem. */
function rampartPalisade(moat = false): Fortification {
  const p = palisade(false);
  return {
    ...p,
    kind: 'rampart',
    top: 'palisade',
    segments: p.segments.map((s) => ({ ...s, topBuiltDay: 0, ...(moat ? { moatDay: 0 } : {}) })),
  };
}

/** Útočníci z jihu (skupina 0) proti obránci doma uprostřed – hradba neobsazená. */
function start(assault?: GroupAssault, men = 4): BattleState {
  const b = battle({
    attackers: Array.from({ length: men }, (_, i) => attacker(i, { x: 0, z: -60 })),
    defenders: [defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 })],
  });
  if (assault) b.groups[0]!.assault = assault;
  return b;
}

/** Takty boje se záznamem hodin fází prvního průlomu (fáze před taktem, kdy práce přibyla). */
function timed(
  b: BattleState,
  f: BattleField,
  ticks: number,
  each: (t: number) => void = () => {},
): Record<string, number> {
  const hours: Record<string, number> = {};
  for (let t = 1; t <= ticks && b.outcome === 'ongoing'; t++) {
    const br = b.breaches[0];
    const phase = br?.phase;
    const done = br?.progress.done ?? 0;
    battleTick(b, f, tickRandom(7, t, 'battle'));
    const after = b.breaches[0];
    if (after && phase && after.progress.done > done) {
      hours[phase] = (hours[phase] ?? 0) + f.hoursPerTick;
    } else if (after && !phase && after.progress.done > 0) {
      hours[after.phase] = (hours[after.phase] ?? 0) + f.hoursPerTick;
    }
    each(t);
  }
  return hours;
}

describe('oheň (Přechod hradby – Oheň)', () => {
  it('vypálit palisádu se 4 muži ≈ 12 h – otepi z lesa 4 h, hoří 8 h (2 přikládají)', () => {
    const f = fieldAt([palisade(false)], { forest: forestSouth });
    const b = start('burn');
    const h = timed(b, f, 1500);
    const br = b.breaches[0]!;
    expect(br.method).toBe('burn');
    expect(br.progress.breached).toBe(true);
    expect(h.fuel).toBeCloseTo(4, 0);
    expect(h.burn).toBeCloseTo(8, 0);
    expect(h.fill).toBeUndefined();
  });

  it('palisáda na valu: napřed zasypat val 20 h, pak otepi a oheň 12 h', () => {
    const f = fieldAt([rampartPalisade()], { forest: forestSouth });
    const b = start('burn');
    const h = timed(b, f, 2500);
    const br = b.breaches[0]!;
    expect(br.need.fill).toBe(80);
    expect(br.progress.breached).toBe(true);
    expect(h.fill).toBeCloseTo(20, 0);
    expect((h.fuel ?? 0) + (h.burn ?? 0)).toBeCloseTo(12, 0);
  });

  it('bránu palisády vypálí za 6 h – otepi 2 h, hoří 4 h', () => {
    const f = fieldAt([palisade(true)], { forest: forestSouth });
    const b = start('burn');
    const h = timed(b, f, 1500);
    const br = b.breaches[0]!;
    expect([br.spot, br.method, br.progress.breached]).toEqual(['gate', 'burn', true]);
    expect(h.fuel).toBeCloseTo(2, 0);
    expect(h.burn).toBeCloseTo(4, 0);
  });

  it('otepi ze 200 m – sběr dvojnásobný', () => {
    const f = fieldAt([palisade(false)], { fuel: [{ x: 5, z: -231 }] });
    const b = start('burn');
    timed(b, f, 10);
    expect(b.breaches[0]!.need.fuel).toBeCloseTo(32, 6);
  });
});

describe('volba postupu (Přechod hradby – Proč takové pořadí)', () => {
  const method = (fort: Fortification, o: Parameters<typeof fieldAt>[1]): string => {
    const f = fieldAt([fort], o);
    const b = start();
    run(b, f, 400);
    return b.breaches[0]!.method;
  };

  it('palisáda bez valu – nejrychlejší oheň (otepi z lesa i z hromady klád)', () => {
    expect(method(palisade(false), { forest: forestSouth })).toBe('burn');
    expect(method(palisade(false), { fuel: [{ x: 0, z: -60 }] })).toBe('burn');
  });

  it('palisáda na valu – odkopat; bez otepí oheň nejde', () => {
    expect(method(rampartPalisade(), { fuel: [{ x: 0, z: -60 }] })).toBe('dig');
    expect(method(palisade(false), {})).toBe('dig');
  });
});

describe('podkop (Přechod hradby – Podkop)', () => {
  it('roštová hradba se 4 muži za 5 dní; po pětině jsou kopáči pod zemí a nikdo je nezasáhne', () => {
    const f = fieldAt([fortOf('crib')]);
    const b = battle({
      attackers: Array.from({ length: 4 }, (_, i) => attacker(i, { x: 0, z: -60 })),
      defenders: [
        defender(1, { x: 0, z: 0 }, { atHouseOnly: true, strength: 0.1 }),
        // lučištník na stanovišti na koruně západní hradby – přijde k místu podkopu (Ú12)
        defender(
          2,
          { x: -29, z: 10 },
          {
            post: { x: -29, z: 10 },
            bow: true,
            line: true,
            strength: 1,
            onWall: true,
          },
        ),
      ],
    });
    const archer = fighter(b, 'd:2');
    let under = -1;
    let healthAtUnder = 0;
    let doneAtUnder = 0;
    let lost = 0;
    let before = 0;
    const health = (): number =>
      b.fighters.filter((x) => x.side === 'attack').reduce((sum, x) => sum + x.health, 0);
    const h = timed(b, f, 2200, (t) => {
      const br = b.breaches[0];
      const miners = b.fighters.filter((x) => x.underground);
      if (under < 0 && miners.length === 0) before = 400 - health();
      if (under < 0 && miners.length > 0) {
        under = t;
        healthAtUnder = health();
        doneAtUnder = br!.progress.done;
        for (const m of miners) {
          expect(poseOf(m, f, b)).toBe('underground');
          expect(canAttack(archer, m, true)).toBe(false);
        }
      }
      if (under > 0 && br && !br.progress.breached) lost = healthAtUnder - health();
    });
    const br = b.breaches[0]!;
    expect(br.method).toBe('mine');
    expect(br.progress.breached).toBe(true);
    expect(h.work).toBeCloseTo(120, 0);
    // pětina ze 480 mužohodin
    expect(doneAtUnder).toBeGreaterThanOrEqual(96);
    expect(doneAtUnder).toBeLessThan(97);
    // před podkopem je lučištník zasahoval, pod zemí už ne
    expect(before).toBeGreaterThan(0);
    expect(lost).toBe(0);
    expect(b.fighters.some((x) => x.underground)).toBe(false);
  });
});

describe('vodní příkop (Přechod hradby – S valem)', () => {
  it('v létě napřed zasypat 12 h, pak odkopat 20 h – zasypaným kusem k hradbě', () => {
    const f = fieldAt([rampartPalisade(true)], { day: SUMMER });
    expect(f.grid.flags.some((x) => (x & MARCH_WATER) !== 0)).toBe(true);
    const b = start('dig');
    const h = timed(b, f, 2500);
    const br = b.breaches[0]!;
    expect(br.moat).toBeDefined();
    expect(br.need.fill).toBe(48);
    expect(br.progress.breached).toBe(true);
    expect(h.fill).toBeCloseTo(12, 0);
    expect(h.work).toBeCloseTo(20, 0);
  });

  it('žebříky až po zasypání – v pruhu zasypání (návrh Clauda)', () => {
    const f = fieldAt([rampartPalisade(true)], { day: SUMMER, forest: forestSouth });
    const b = start('ladder', 1);
    let inside = -1;
    run(b, f, 3000, (t) => {
      const a = fighter(b, 'a:0');
      if (inside < 0 && a.state === 'fight' && Math.abs(a.pos.x) < 25 && Math.abs(a.pos.z) < 25) {
        inside = t;
      }
    });
    const br = b.breaches[0]!;
    expect([br.method, br.phase, br.progress.breached]).toEqual(['ladder', 'done', false]);
    const mid = {
      x: (br.moat!.from.x + br.moat!.to.x) / 2,
      z: (br.moat!.from.z + br.moat!.to.z) / 2,
    };
    expect(b.ladders).toHaveLength(1);
    const top = b.ladders![0]!.top;
    expect((top.x - mid.x) ** 2 + (top.z - mid.z) ** 2).toBeLessThanOrEqual(4 + 1e-9);
    expect(inside).toBeGreaterThan(0);
  });

  it('zamrzlý (leden) jako suchý – bez zasypání', () => {
    const f = fieldAt([rampartPalisade(true)]);
    expect(f.grid.flags.some((x) => (x & MARCH_WATER) !== 0)).toBe(false);
    const b = start('dig');
    const h = timed(b, f, 2000);
    const br = b.breaches[0]!;
    expect(br.moat).toBeUndefined();
    expect(br.need.fill).toBe(0);
    expect(h.work).toBeCloseTo(20, 0);
  });
});

describe('vypálená brána a věž (Přechod hradby – Oheň; raid-apply)', () => {
  it('brána pod věží shoří i s věží, díl nese den vypálení', () => {
    const fort = palisade(true);
    const gate = fort.gates[0]!;
    fort.gates = [{ ...gate, pincerDay: 0, towerDay: 0 }];
    const v = village([], [], { fortifications: [fort], lastDay: SUMMER });
    applyFortificationBreach(v, SUMMER, {
      fortificationId: fort.id,
      segments: [gate.segment],
      burned: [gate.segment],
      gatesBurned: [gate.segment],
    });
    const after = v.fortifications![0]!;
    const seg = after.segments.find((s) => s.index === gate.segment)!;
    expect([seg.breachedDay, seg.burnedDay, seg.state]).toEqual([SUMMER, SUMMER, 0]);
    expect(after.gates[0]!.towerDay).toBeUndefined();
    expect(after.gates[0]!.pincerDay).toBe(0);
  });

  it('průlom bez ohně věž nechá', () => {
    const fort = palisade(true);
    const gate = fort.gates[0]!;
    fort.gates = [{ ...gate, pincerDay: 0, towerDay: 0 }];
    const v = village([], [], { fortifications: [fort], lastDay: SUMMER });
    applyFortificationBreach(v, SUMMER, { fortificationId: fort.id, segments: [gate.segment] });
    const after = v.fortifications![0]!;
    expect(after.segments.find((s) => s.index === gate.segment)!.burnedDay).toBeUndefined();
    expect(after.gates[0]!.towerDay).toBe(0);
  });
});

describe('po kouscích taktů (Review Focus 4)', () => {
  const same = (startState: () => BattleState, f: BattleField, ticks: number): BattleState => {
    const whole = startState();
    for (let t = 1; t <= ticks; t++) battleTick(whole, f, tickRandom(7, t, 'battle'));
    for (const chunk of [1, 7, 40]) {
      let b = startState();
      for (let t = 1; t <= ticks; t++) {
        battleTick(b, f, tickRandom(7, t, 'battle'));
        if (t % chunk === 0) b = JSON.parse(JSON.stringify(b)) as BattleState;
      }
      expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(whole)));
    }
    return whole;
  };

  it('oheň s valem a vodním příkopem = vcelku', () => {
    const f = fieldAt([rampartPalisade(true)], { day: SUMMER, forest: forestSouth });
    const whole = same(() => start('burn', 6), f, 900);
    expect(whole.breaches[0]!.progress.breached).toBe(true);
  });

  it('podkop s kopáči pod zemí = vcelku', () => {
    const f = fieldAt([fortOf('crib')]);
    const whole = same(() => start('mine'), f, 600);
    expect(whole.fighters.some((x) => x.underground)).toBe(true);
  });
});
