import { describe, expect, it } from 'vitest';
import { HUNT_FIGHT, HUNT_QUARRY } from '../../village/rules/rules-wildlife';
import type { QuarryKind } from '../../village/types';
import {
  addHunters,
  dropHunters,
  huntFightTick,
  newHuntFight,
  releaseQuarry,
  type HuntField,
  type HuntFight,
  type HuntFighter,
  type NewHunter,
} from '../hunt-fight';
import { marchCellAt, marchCellCenter, type MarchGrid, type Pos } from '../march-grid';
import { WAR } from '../rules-war';
import { TICKS_PER_SECOND, tickRandom } from '../ticks';
import { field as battleField } from './battle-fixtures';

// Souboj se zvěří A (plán 2026-11-22-hunting – Úloha 4): rovná louka, zvíře u dveří lesa (0, 0)
// vyběhne na (40, 0), lovec vyrazí z (120, 0); herní den 86,4 s.

const DOOR: Pos = { x: 0, z: 0 };
const OUT: Pos = { x: HUNT_FIGHT.emergeM, z: 0 };
const START: Pos = { x: 120, z: 0 };
const MEADOW: HuntField = { grid: null, hoursPerTick: 24 / (86.4 * TICKS_PER_SECOND) };
const IDLE_TICKS = HUNT_FIGHT.idleS * TICKS_PER_SECOND;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Pěší lovec (boj 50, síla 1) – muž rodu. */
function walker(personId = 1, o: Partial<NewHunter> = {}): NewHunter {
  return {
    personId,
    pos: START,
    mounted: false,
    strength: 1,
    footStrength: 1,
    skills: { bow: 0, combat: 50, riding: 0 },
    lineMan: true,
    health: 100,
    ...o,
  };
}

/** Jezdec (síla 1,5, pěšky 1, jízda 60). */
function rider(personId = 1, o: Partial<NewHunter> = {}): NewHunter {
  return walker(personId, {
    mounted: true,
    strength: 1.5,
    skills: { bow: 0, combat: 50, riding: 60 },
    ...o,
  });
}

/** Lov: zvíře vyběhne v taktu 0 a lovci na něj vyrazí. */
function hunt(hunters: readonly NewHunter[], kind: QuarryKind = 'stag'): HuntFight {
  const f = newHuntFight(kind, DOOR, 0);
  releaseQuarry(f, OUT, 0);
  addHunters(f, hunters, 0);
  return f;
}

/** Jeden takt s náhodou taktu (`tickRandom`). */
function tick(f: HuntFight, field: HuntField = MEADOW, seed = 7): void {
  huntFightTick(f, field, tickRandom(seed, f.tick + 1, 'hunt'));
}

/** Takty do konce souboje, nejvýš `max`; `each` po každém. Vrací počet taktů. */
function runHunt(
  f: HuntFight,
  max: number,
  field: HuntField = MEADOW,
  seed = 7,
  each: () => void = () => {},
): number {
  let n = 0;
  while (f.outcome === 'ongoing' && n < max) {
    tick(f, field, seed);
    n++;
    each();
  }
  return n;
}

function hunter(f: HuntFight, personId: number): HuntFighter {
  const h = f.hunters.find((x) => x.personId === personId);
  if (!h) throw new Error(`Lovec ${personId} chybí`);
  return h;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[Math.floor(mid)]!;
}

/** Takty do zabití jelena jedním lovcem; zvíře musí padnout do 960 taktů. */
function killTicks(h: NewHunter, seed: number): number {
  const f = hunt([h]);
  const n = runHunt(f, 960, MEADOW, seed);
  expect(f.outcome).toBe('killed');
  return n;
}

describe('souboj se zvěří – honba a uštvání jelena (plán 2026-11-22-hunting, Úloha 4)', () => {
  it('pěší (boj 50, síla 1) jelena uštve a zabije do 960 taktů', () => {
    for (const seed of SEEDS) {
      const f = hunt([walker()]);
      const seen = new Set<string>();
      let stamina = HUNT_QUARRY.stag.staminaS as number;
      const n = runHunt(f, 960, MEADOW, seed, () => {
        seen.add(f.quarry.state);
        stamina = Math.min(stamina, f.quarry.stamina);
      });
      expect(n).toBeLessThanOrEqual(960);
      expect(f.outcome).toBe('killed');
      expect(f.killer).toBe(1);
      expect(f.quarry.state).toBe('dead');
      expect(f.quarry.health).toBe(0);
      // jelen utíkal, až se uštval – zastavil (spent) a nechal se zabít
      expect(seen.has('flee')).toBe(true);
      expect(seen.has('spent')).toBe(true);
      expect(stamina).toBe(0);
      expect(f.quarry.hits).toBeGreaterThanOrEqual(
        Math.ceil(HUNT_QUARRY.stag.health / (WAR.combat.hitPerStrength * 1)),
      );
    }
  });

  it('jezdec (síla 1,5, jízda 60) je rychlejší – medián z 20 seedů menší než u pěšího a ≤ 480 taktů', () => {
    const foot = SEEDS.map((s) => killTicks(walker(), s));
    const mounted = SEEDS.map((s) => killTicks(rider(), s));
    expect(median(mounted)).toBeLessThan(median(foot));
    expect(median(mounted)).toBeLessThanOrEqual(480);
  });

  it('jelen lovce nezraní – zdraví 100 po celou dobu', () => {
    const f = hunt([walker(1), rider(2)]);
    runHunt(f, 960, MEADOW, 3, () => {
      for (const h of f.hunters) {
        expect(h.health).toBe(100);
        expect(h.hits).toBe(0);
        expect(h.state).not.toBe('down');
      }
    });
    expect(f.outcome).toBe('killed');
    expect([1, 2]).toContain(f.killer);
  });

  it('nikdo nejde – po idleS × 4 taktech útěk k dveřím, pak gone a escaped', () => {
    const f = newHuntFight('hind', DOOR, 0);
    // skryté v lese (honci ještě nedošli) – nečinnost se nepočítá
    for (let t = 0; t < 2 * IDLE_TICKS; t++) tick(f);
    expect(f.quarry.state).toBe('hidden');
    expect(f.quarry.pos).toEqual(DOOR);
    expect(f.tick).toBe(2 * IDLE_TICKS);
    const released = f.tick;
    releaseQuarry(f, OUT, released);
    for (let t = 1; t < IDLE_TICKS; t++) {
      tick(f);
      expect(f.quarry.state).not.toBe('escape');
    }
    // vyběhlo 40 m ven a stojí
    expect(f.quarry.state).toBe('stand');
    expect(f.quarry.goal).toBeNull();
    expect(f.quarry.pos).toEqual(OUT);
    tick(f);
    expect(f.tick).toBe(released + IDLE_TICKS);
    expect(f.quarry.state).toBe('escape');
    expect(f.outcome).toBe('ongoing');
    const n = runHunt(f, 200);
    // 40 m tempem laně 4,5 m/s ≈ 36 taktů
    expect(n).toBeLessThanOrEqual(Math.ceil(OUT.x / (HUNT_QUARRY.hind.paceMS / TICKS_PER_SECOND)));
    expect(f.quarry.state).toBe('gone');
    expect(f.quarry.pos).toEqual(DOOR);
    expect(f.outcome).toBe('escaped');
    expect(f.killer).toBeNull();
    // po konci takt nic nezmění
    const before = JSON.stringify(f);
    tick(f);
    expect(JSON.stringify(f)).toBe(before);
  });

  it('dropHunters během honby → po idleS útěk', () => {
    const f = hunt([walker(1)]);
    for (let t = 0; t < 100; t++) tick(f);
    expect(f.outcome).toBe('ongoing');
    expect(f.activeTick).toBe(f.tick);
    const last = f.activeTick;
    const at = { ...hunter(f, 1).pos };
    dropHunters(f, [1]);
    for (let t = 1; t < IDLE_TICKS; t++) {
      tick(f);
      expect(f.quarry.state).not.toBe('escape');
      // lovec bez povelu stojí, kde ho hráč odvolal
      expect(hunter(f, 1).pos).toEqual(at);
    }
    tick(f);
    expect(f.tick).toBe(last + IDLE_TICKS);
    expect(f.quarry.state).toBe('escape');
    runHunt(f, 2000);
    expect(f.outcome).toBe('escaped');
    expect(f.quarry.state).toBe('gone');
    expect(f.quarry.pos).toEqual(DOOR);
  });

  it('addHunters: týž muž podruhé nepřibude, odvolaný se vrátí s hodinami výcviku', () => {
    const f = hunt([rider(1)]);
    addHunters(f, [rider(1)], 0);
    expect(f.hunters).toHaveLength(1);
    for (let t = 0; t < 60; t++) tick(f);
    const riding = hunter(f, 1).hours.riding;
    expect(riding).toBeGreaterThan(0);
    dropHunters(f, [1]);
    for (let t = 0; t < 20; t++) tick(f);
    // odvolaný necvičí, hodiny mu zůstanou pro výsledek
    expect(hunter(f, 1).hours.riding).toBe(riding);
    addHunters(f, [walker(2), rider(1, { pos: { x: 200, z: 0 } })], f.tick);
    expect(f.hunters.map((h) => h.personId)).toEqual([1, 2]);
    expect(hunter(f, 1).pos).toEqual({ x: 200, z: 0 });
    expect(hunter(f, 1).hours.riding).toBe(riding);
    expect(f.activeTick).toBe(f.tick);
    runHunt(f, 960);
    expect(f.outcome).toBe('killed');
  });

  it('jezdec má hodiny jízdy, součet hodin nejvýš 6', () => {
    for (const seed of [1, 2, 3]) {
      const mounted = hunt([rider(1)]);
      runHunt(mounted, 960, MEADOW, seed);
      const foot = hunt([walker(1)]);
      runHunt(foot, 960, MEADOW, seed);
      expect(mounted.outcome).toBe('killed');
      expect(foot.outcome).toBe('killed');
      const r = hunter(mounted, 1).hours;
      const w = hunter(foot, 1).hours;
      // honba z koně přesáhne 6 h – jezdec cvičí jízdu i boj
      expect(r.riding).toBeGreaterThan(0);
      expect(r.combat).toBeGreaterThan(0);
      expect(r.bow).toBe(0);
      // pěší jízdu necvičí, boj zblízka ano
      expect(w.riding).toBe(0);
      expect(w.combat).toBeGreaterThan(0);
      for (const h of [r, w]) {
        expect(h.bow + h.combat + h.riding).toBeLessThanOrEqual(HUNT_FIGHT.maxHours + 1e-9);
      }
    }
  });

  it('po 1 / 7 / 40 taktech přes JSON.parse(JSON.stringify(f)) = vcelku', () => {
    const scenarios: (() => HuntFight)[] = [
      () => hunt([walker(1), rider(2, { pos: { x: 140, z: -30 } })]),
      () => hunt([]),
    ];
    for (const make of scenarios) {
      const whole = make();
      runHunt(whole, 2000, MEADOW, 11);
      expect(whole.outcome).not.toBe('ongoing');
      for (const chunk of [1, 7, 40]) {
        let f = make();
        let n = 0;
        while (f.outcome === 'ongoing' && n < 2000) {
          for (let i = 0; i < chunk && f.outcome === 'ongoing'; i++, n++) tick(f, MEADOW, 11);
          f = JSON.parse(JSON.stringify(f)) as HuntFight;
        }
        expect(JSON.stringify(f)).toBe(JSON.stringify(whole));
      }
    }
  });

  it('pruh vody v mřížce: lovec se nezasekne a k zvířeti dojde podél kraje', () => {
    // pruh vody 10 m široký (středy buněk x 70…80 m) od z = 0 m na sever – leží mezi lovcem
    // (120, 60) a jelenem; lovec narazí na východní kraj a sklouzne po něm k jihu kolem konce pruhu
    const base = battleField().grid;
    const pace = Float32Array.from(base.pace);
    const wet = (p: Pos): boolean => p.x >= 70 && p.x <= 80 && p.z >= 0 && p.z <= 300;
    for (let c = 0; c < pace.length; c++) if (wet(marchCellCenter(base, c))) pace[c] = 0;
    const grid: MarchGrid = { ...base, pace };
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    const f = hunt([walker(1, { pos: { x: 120, z: 60 } })]);
    let alongEdge = 0;
    let nearest = Infinity;
    const n = runHunt(f, 2000, field, 5, () => {
      const h = hunter(f, 1);
      expect(grid.pace[marchCellAt(grid, h.pos)]!).toBeGreaterThan(0);
      expect(grid.pace[marchCellAt(grid, f.quarry.pos)]!).toBeGreaterThan(0);
      // u východního kraje pruhu (buňka x = 82,5 m) nad jeho koncem
      if (h.pos.x > 80 && h.pos.x < 84 && h.pos.z > 0) alongEdge++;
      nearest = Math.min(nearest, Math.hypot(h.pos.x - f.quarry.pos.x, h.pos.z - f.quarry.pos.z));
    });
    expect(alongEdge).toBeGreaterThan(10);
    expect(nearest).toBeLessThanOrEqual(WAR.combat.meleeM);
    expect(f.outcome).toBe('killed');
    expect(f.killer).toBe(1);
    expect(n).toBeLessThan(2000);
  });
});
