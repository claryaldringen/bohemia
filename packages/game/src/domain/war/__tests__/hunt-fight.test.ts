import { describe, expect, it } from 'vitest';
import { HUNT_FIGHT, HUNT_QUARRY } from '../../village/rules/rules-wildlife';
import type { QuarryKind } from '../../village/types';
import { hitDamage } from '../battle';
import {
  addHunters,
  dropHunters,
  fightResult,
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

  it('jezdec má hodiny jízdy, součet hodin nejvýš 6 až ve výsledku – poměrně', () => {
    for (const seed of [1, 2, 3]) {
      const mounted = hunt([rider(1)]);
      runHunt(mounted, 960, MEADOW, seed);
      const foot = hunt([walker(1)]);
      runHunt(foot, 960, MEADOW, seed);
      expect(mounted.outcome).toBe('killed');
      expect(foot.outcome).toBe('killed');
      const r = hunter(mounted, 1).hours;
      const w = hunter(foot, 1).hours;
      // syrové hodiny celého lovu – honba z koně sama přesáhne 6 h, jezdec cvičí jízdu i boj
      expect(r.riding).toBeGreaterThan(0);
      expect(r.combat).toBeGreaterThan(0);
      expect(r.bow).toBe(0);
      expect(r.riding + r.combat).toBeGreaterThan(HUNT_FIGHT.maxHours);
      // pěší jízdu necvičí, boj zblízka ano
      expect(w.riding).toBe(0);
      expect(w.combat).toBeGreaterThan(0);
      // strop 6 h až ve výsledku – přetečení zkrátí všechny dovednosti stejným dílem
      for (const [f, raw] of [
        [mounted, r],
        [foot, w],
      ] as const) {
        const [t] = fightResult(f, new Map(), new Map()).trained;
        if (!t) throw new Error('Lovec bez výcviku');
        const sum = t.hours.bow + t.hours.combat + t.hours.riding;
        const rawSum = raw.bow + raw.combat + raw.riding;
        expect(sum).toBeCloseTo(Math.min(HUNT_FIGHT.maxHours, rawSum), 9);
        expect(sum).toBeLessThanOrEqual(HUNT_FIGHT.maxHours + 1e-9);
        expect(t.hours.combat * rawSum).toBeCloseTo(raw.combat * sum, 9);
        expect(t.hours.riding * rawSum).toBeCloseTo(raw.riding * sum, 9);
      }
    }
  });

  it('po 1 / 7 / 40 taktech přes JSON.parse(JSON.stringify(f)) = vcelku', () => {
    const scenarios: (() => HuntFight)[] = [
      () => hunt([walker(1), rider(2, { pos: { x: 140, z: -30 } })]),
      () => hunt([]),
      // Úloha 5: medvěd se brání – rány lovcům, kůň jezdce, šípy muže rodu, padlí
      () =>
        hunt(
          [
            walker(1, { skills: { bow: 40, combat: 50, riding: 0 } }),
            rider(2, { pos: { x: 140, z: -30 } }),
          ],
          'bear',
        ),
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
    let nearest = Infinity;
    const n = runHunt(f, 2000, field, 5, () => {
      const h = hunter(f, 1);
      expect(grid.pace[marchCellAt(grid, h.pos)]!).toBeGreaterThan(0);
      expect(grid.pace[marchCellAt(grid, f.quarry.pos)]!).toBeGreaterThan(0);
      nearest = Math.min(nearest, Math.hypot(h.pos.x - f.quarry.pos.x, h.pos.z - f.quarry.pos.z));
    });
    expect(nearest).toBeLessThanOrEqual(WAR.combat.meleeM);
    expect(f.outcome).toBe('killed');
    expect(f.killer).toBe(1);
    expect(n).toBeLessThan(2000);
  });

  /** Mřížka s pruhem vody x 70–80 m, z od `zFrom` do `zTo` m. */
  function stripGrid(
    zFrom: number,
    zTo: number,
    extra: (p: Pos) => boolean = () => false,
  ): MarchGrid {
    const base = battleField().grid;
    const pace = Float32Array.from(base.pace);
    for (let c = 0; c < pace.length; c++) {
      const p = marchCellCenter(base, c);
      if ((p.x >= 70 && p.x <= 80 && p.z >= zFrom && p.z <= zTo) || extra(p)) pace[c] = 0;
    }
    return { ...base, pace };
  }

  it('objížďka: voda kolmo přes cestu lovce (zvíře přímo za pruhem), průchod na kraji → lovec dojde a zabije', () => {
    const grid = stripGrid(-60, 60);
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    const f = hunt([walker(1)]);
    Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand' });
    let around = false;
    runHunt(f, 4000, field, 5, () => {
      const h = hunter(f, 1);
      expect(grid.pace[marchCellAt(grid, h.pos)]!).toBeGreaterThan(0);
      if (h.route && h.route.length > 0) around = true;
    });
    expect(around).toBe(true);
    expect(f.outcome).toBe('killed');
    expect(f.killer).toBe(1);
  });

  it('objížďka: výsledek nezávisí na dělení taktů (JSON mezi takty)', () => {
    const grid = stripGrid(-60, 60);
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    const a = hunt([walker(1)]);
    const b = hunt([walker(1)]);
    for (let t = 0; t < 600 && a.outcome === 'ongoing'; t++) {
      tick(a, field, 5);
      tick(b, field, 5);
      Object.assign(b, JSON.parse(JSON.stringify(b)));
      b.hunters = JSON.parse(JSON.stringify(b.hunters));
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  /** Uzavřená kapsa: prstenec nepřístupných buněk 10–20 m kolem místa, kam zvíře vyběhne. */
  function pocketGrid(): MarchGrid {
    return stripGrid(0, -1, (p) => {
      const dx = Math.abs(p.x - OUT.x);
      const dz = Math.abs(p.z);
      return Math.max(dx, dz) >= 10 && Math.max(dx, dz) <= 20;
    });
  }

  it('uzavřená kapsa kolem zvířete: lovec stojí a zvíře po idleS uteče (bez hráče lov skončí)', () => {
    const grid = pocketGrid();
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    expect(grid.pace[marchCellAt(grid, OUT)]!).toBeGreaterThan(0);
    for (const kind of ['stag', 'boar'] as const) {
      const f = hunt([veteran(1)], kind);
      Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand' });
      runHunt(f, 4000, field, 5);
      expect(f.outcome).toBe('escaped');
    }
  });

  it('kapsa kolem kance a bachyně, lovec s lukem 50 uvízne v pásmu luku: šíp prase srazí na zdraví 1, pak míření není činnost → po idleS uteče jako bez luku', () => {
    // šíp prase nezabije, jen zraní – lovec, který k němu nedojde, by mířením lov držel navždy
    // (Martin 22. 11. 2026: „Když se dlouho nebude nic dít … zvíře uteče zpět do lesa“)
    const field: HuntField = { grid: pocketGrid(), hoursPerTick: MEADOW.hoursPerTick };
    for (const kind of ['boar', 'sow'] as const) {
      const f = hunt([veteran(1, { skills: { bow: 50, combat: 70, riding: 0 } })], kind);
      Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand' });
      let down = 0;
      let escape = 0;
      runHunt(f, 8000, field, 5, () => {
        if (down === 0 && f.quarry.health <= 1) down = f.tick;
        if (escape === 0 && f.quarry.state === 'escape') escape = f.tick;
      });
      // lovec stál v pásmu luku a šípy prase srazily na 1 – dál už ho posunout nemohou
      expect(down).toBeGreaterThan(0);
      expect(f.quarry.health).toBe(1);
      expect(hunter(f, 1).hours.bow).toBeGreaterThan(0);
      expect(f.outcome).toBe('escaped');
      expect(escape - down).toBeLessThanOrEqual(IDLE_TICKS);
    }
  });

  it('kapsa: lovec stojí ve výklenku u vody, jelen v kapse před ním dlouho utíká podél vody → uteče nejpozději idleS od posledního pohybu lovce', () => {
    // kapsa (středy buněk x 32,5–47,5, z −57,5 až −12,5) jižně od dveří lesa, lovec ve výklenku
    // vody na východ od ní: jelen utíká k západní vodě a klouže po ní k severu, než uvízne v rohu
    // (≈ 75 taktů) – dlouho po posledním kroku lovce; nečinnost je nečinnost lovce, ne zvířete
    const base = battleField().grid;
    const niche = marchCellCenter(base, marchCellAt(base, { x: 60, z: -50 }));
    const within = (p: Pos, x0: number, x1: number, z0: number, z1: number): boolean =>
      p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
    const grid = stripGrid(0, -1, (p) => {
      const wall = within(p, 27.5, 52.5, -62.5, -7.5) && !within(p, 32.5, 47.5, -57.5, -12.5);
      const d = Math.max(Math.abs(p.x - niche.x), Math.abs(p.z - niche.z));
      return wall || (d > 1 && d < 4);
    });
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    const f = hunt([walker(1, { pos: niche })]);
    Object.assign(f.quarry, { pos: { x: 40, z: -47.5 }, goal: null, state: 'stand' });
    let lastMove = 0;
    let lastFlight = 0;
    let last = { ...hunter(f, 1).pos };
    let was = { ...f.quarry.pos };
    runHunt(f, 4000, field, 5, () => {
      const p = hunter(f, 1).pos;
      if (p.x !== last.x || p.z !== last.z) lastMove = f.tick;
      last = { ...p };
      const q = f.quarry;
      if (q.state === 'flee' && (q.pos.x !== was.x || q.pos.z !== was.z)) lastFlight = f.tick;
      was = { ...q.pos };
    });
    // jelen utíkal déle po posledním kroku lovce, než je rezerva – nečinnost podle útěku zvířete
    // (honba bez pohybu lovce) by lov protáhla za ni
    expect(lastFlight - lastMove).toBeGreaterThan(40);
    expect(f.outcome).toBe('escaped');
    expect(f.tick - lastMove).toBeLessThanOrEqual(IDLE_TICKS + 40);
  });

  it('honba, kdy se vzdálenost zvětšuje (jelen je rychlejší než pěší lovec): zvíře neuteče, dokud ho lovec pronásleduje', () => {
    const f = hunt([walker(1)]);
    let grew = false;
    let d = Infinity;
    for (let t = 0; t < IDLE_TICKS + 200 && f.outcome === 'ongoing'; t++) {
      tick(f);
      const nd = Math.hypot(
        hunter(f, 1).pos.x - f.quarry.pos.x,
        hunter(f, 1).pos.z - f.quarry.pos.z,
      );
      if (nd > d && f.quarry.state === 'flee') grew = true;
      d = nd;
      expect(f.quarry.state).not.toBe('escape');
    }
    expect(grew).toBe(true);
  });

  it('lovec se pohybuje, ale ke stojícímu zvířeti se nepřiblíží (klouže) → zvíře po idleS uteče', () => {
    // pruh vody přes celou mapu: lovec se u něj pohybuje (klouže), ale blíž k zvířeti se nedostane
    const f = hunt([walker(1)]);
    Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand' });
    const grid = stripGrid(-1000, 1000);
    const field: HuntField = { grid, hoursPerTick: MEADOW.hoursPerTick };
    let moves = 0;
    let last = { ...hunter(f, 1).pos };
    runHunt(f, 4000, field, 5, () => {
      const p = hunter(f, 1).pos;
      if (p.x !== last.x || p.z !== last.z) moves++;
      last = { ...p };
    });
    expect(moves).toBeGreaterThan(0);
    expect(f.outcome).toBe('escaped');
  });
});

// Souboj se zvěří B (plán 2026-11-22-hunting – Úloha 5): kanec, bachyně, vlk a medvěd se brání,
// rány lovců, kůň a luk. Rovná louka, zvíře vyběhne z (0, 0) na (40, 0), lovci z (120, 0).

/** Takty, za které lov jistě skončí (lovec padne nebo zvíře, útěk po nečinnosti). */
const LONG = 4000;
const FULL = WAR.combat.health;

/** Pěší lovec s bojem `combat` (síla 1, bez luku). */
function footman(personId: number, combat: number, o: Partial<NewHunter> = {}): NewHunter {
  return walker(personId, { skills: { bow: 0, combat, riding: 0 }, ...o });
}

/** Zkušený pěší (boj 70, síla 1,5, bez luku). */
function veteran(personId: number, o: Partial<NewHunter> = {}): NewHunter {
  return footman(personId, 70, { strength: 1.5, footStrength: 1.5, ...o });
}

/** Jezdec s bojem 70 a jízdou `riding` (na koni síla 1,5, pěšky 1). */
function horseman(personId: number, riding: number): NewHunter {
  return rider(personId, { skills: { bow: 0, combat: 70, riding } });
}

/** Seedy (z 20), ve kterých lov skončil zabitým zvířetem. */
function killSeeds(kind: QuarryKind, hunters: () => readonly NewHunter[]): number[] {
  return SEEDS.filter((seed) => {
    const f = hunt(hunters(), kind);
    runHunt(f, LONG, MEADOW, seed);
    expect(f.outcome).not.toBe('ongoing');
    return f.outcome === 'killed';
  });
}

describe('souboj se zvěří – kanec, vlk, medvěd, rány lovců, kůň a luk (plán 2026-11-22-hunting, Úloha 5)', () => {
  it('nováček (boj 20) kance pěšky nezabije – v 20 seedech kanec vždy žije a lovec je down nebo zraněný', () => {
    for (const seed of SEEDS) {
      const f = hunt([footman(1, 20)], 'boar');
      const seen = new Set<string>();
      runHunt(f, LONG, MEADOW, seed, () => {
        seen.add(f.quarry.state);
        // rána pod branou umu vždy mine – kanec je bez škrábnutí
        expect(f.quarry.health).toBe(HUNT_QUARRY.boar.health);
      });
      expect(seen.has('charge')).toBe(true);
      expect(f.outcome).toBe('escaped');
      expect(f.killer).toBeNull();
      const h = hunter(f, 1);
      expect(h.hits).toBeGreaterThan(0);
      expect(h.state === 'down' || h.health < FULL).toBe(true);
    }
  });

  it('zkušený (boj 70, síla 1,5) kance pěšky zabije aspoň ve 12 z 20 seedů', () => {
    expect(killSeeds('boar', () => [veteran(1)]).length).toBeGreaterThanOrEqual(12);
    // bachyně má touž bránu
    expect(killSeeds('sow', () => [footman(1, 59)])).toEqual([]);
    expect(killSeeds('sow', () => [veteran(1)]).length).toBeGreaterThanOrEqual(12);
  });

  it('dokud jezdec sedí na koni, kance nezraní (boj 70, jízda 40); boj 70 a jízda 80 ho zabije aspoň ve 12 z 20', () => {
    for (const seed of SEEDS) {
      const f = hunt([horseman(1, 40)], 'boar');
      runHunt(f, LONG, MEADOW, seed, () => {
        // z koně pod branou jízdy každá rána mine – kanec je bez škrábnutí, dokud jezdec sedí
        if (hunter(f, 1).mounted) expect(f.quarry.health).toBe(HUNT_QUARRY.boar.health);
      });
      expect(f.outcome).not.toBe('ongoing');
      // z koně ho nezabil; padne-li mu kůň, bojuje pěšky a s bojem 70 je pěšky nad branou
      if (f.outcome === 'killed') expect(hunter(f, 1).horseLost).toBe(true);
    }
    expect(killSeeds('boar', () => [horseman(1, 80)]).length).toBeGreaterThanOrEqual(12);
  });

  it('osamělý lovec (boj 50) proti medvědovi je down ve ≥ 15 z 20; tři muži (boj 70) medvěda složí ve ≥ 12 z 20', () => {
    let down = 0;
    for (const seed of SEEDS) {
      const f = hunt([walker(1)], 'bear');
      runHunt(f, LONG, MEADOW, seed);
      if (hunter(f, 1).state === 'down') down++;
    }
    expect(down).toBeGreaterThanOrEqual(15);
    const three = (): NewHunter[] =>
      [1, 2, 3].map((id) => veteran(id, { pos: { x: START.x, z: (id - 2) * 4 } }));
    expect(killSeeds('bear', three).length).toBeGreaterThanOrEqual(12);
  });

  it('vlka lovec s bojem 40 zabije ve ≥ 14 z 20', () => {
    expect(killSeeds('wolf', () => [footman(1, 40)]).length).toBeGreaterThanOrEqual(14);
  });

  it('kanec na jezdce: v některém seedu horseLost a jezdec dál bojuje pěšky (mounted false)', () => {
    const lostSeeds: number[] = [];
    for (const seed of SEEDS) {
      const f = hunt([horseman(1, 40)], 'boar');
      let lostAt: number | null = null;
      let onFoot = false;
      runHunt(f, LONG, MEADOW, seed, () => {
        const h = hunter(f, 1);
        if (h.horseLost && lostAt === null) {
          lostAt = f.tick;
          expect(h.mounted).toBe(false);
          expect(h.strength).toBe(h.footStrength);
          expect(h.horseHealth).toBe(0);
        } else if (lostAt !== null && h.state === 'fight') {
          onFoot = true;
          expect(h.mounted).toBe(false);
        }
      });
      if (lostAt === null) continue;
      expect(onFoot).toBe(true);
      expect(fightResult(f, new Map(), new Map([[1, 42]])).horsesLost).toEqual([42]);
      lostSeeds.push(seed);
    }
    expect(lostSeeds.length).toBeGreaterThan(0);
    // odvolaný jezdec, kterému kůň padl, se vrátí pěšky – padlý kůň neožije
    const back = hunt([horseman(1, 40)], 'boar');
    Object.assign(hunter(back, 1), {
      mounted: false,
      strength: 1,
      horseHealth: 0,
      horseLost: true,
    });
    dropHunters(back, [1]);
    addHunters(back, [horseman(1, 40)], 0);
    expect(hunter(back, 1)).toMatchObject({
      mounted: false,
      strength: 1,
      horseHealth: 0,
      horseLost: true,
      state: 'chase',
    });
    // vlk jde vždy po jezdci, koně nezraní
    for (const seed of SEEDS) {
      const f = hunt([rider(1)], 'wolf');
      runHunt(f, LONG, MEADOW, seed);
      expect(hunter(f, 1).horseHealth).toBe(HUNT_FIGHT.horseHealth);
      expect(hunter(f, 1).horseLost).toBeUndefined();
    }
  });

  it('lukostřelec (luk 80) trefí jelena z 40 m za 400 taktů víckrát než nováček (luk 10) – součet přes 20 seedů', () => {
    /** Zásahy šípem (lovec dál než na ránu zblízka) za 400 taktů od 40 m, součet přes seedy. */
    const arrows = (o: Partial<NewHunter>): { hits: number; bowHours: number } => {
      let hits = 0;
      let bowHours = 0;
      for (const seed of SEEDS) {
        const f = hunt([], 'stag');
        runHunt(f, 40, MEADOW, seed);
        expect(f.quarry.state).toBe('stand');
        expect(f.quarry.pos).toEqual(OUT);
        addHunters(f, [walker(1, { pos: { x: OUT.x + 40, z: 0 }, ...o })], f.tick);
        for (let t = 0; t < 400 && f.outcome === 'ongoing'; t++) {
          const before = f.quarry.hits;
          tick(f, MEADOW, seed);
          const h = hunter(f, 1);
          const d = Math.hypot(h.pos.x - f.quarry.pos.x, h.pos.z - f.quarry.pos.z);
          if (d > WAR.combat.meleeM) hits += f.quarry.hits - before;
        }
        bowHours += hunter(f, 1).hours.bow;
      }
      return { hits, bowHours };
    };
    const master = arrows({ skills: { bow: 80, combat: 50, riding: 0 } });
    const novice = arrows({ skills: { bow: 10, combat: 50, riding: 0 } });
    expect(master.hits).toBeGreaterThan(novice.hits);
    expect(master.bowHours).toBeGreaterThan(0);
    expect(novice.bowHours).toBeGreaterThan(0);
    // hodiny luku přibývají jen v taktu výstřelu (střela připravená, zvíře v pásmu luku)
    const f = hunt([], 'stag');
    runHunt(f, 40, MEADOW, 3);
    addHunters(
      f,
      [walker(1, { pos: { x: OUT.x + 40, z: 0 }, skills: { bow: 80, combat: 50, riding: 0 } })],
      f.tick,
    );
    let shots = 0;
    for (let t = 0; t < 200 && f.outcome === 'ongoing'; t++) {
      const h = hunter(f, 1);
      const before = h.hours.bow;
      const ready = h.cooldown <= 1;
      tick(f, MEADOW, 3);
      const d = Math.hypot(h.pos.x - f.quarry.pos.x, h.pos.z - f.quarry.pos.z);
      const grew = h.hours.bow > before;
      if (grew) {
        shots++;
        expect(ready).toBe(true);
        expect(d).toBeGreaterThan(WAR.combat.meleeM);
      }
    }
    expect(shots).toBeGreaterThan(0);
    // luk nosí jen muž rodu – vesničan nestřílí ani necvičí
    const villager = arrows({ lineMan: false, skills: { bow: 80, combat: 50, riding: 0 } });
    expect(villager).toEqual({ hits: 0, bowHours: 0 });
  });

  it('šíp kance a bachyni nezabije: luk 80, boj 0 jen zraní (zdraví aspoň 1); lovec s bojem nad branou dorazí', () => {
    for (const kind of ['boar', 'sow'] as const) {
      let wounded = 0;
      for (const seed of SEEDS) {
        const f = hunt(
          [walker(1, { pos: { x: 100, z: 0 }, skills: { bow: 80, combat: 0, riding: 0 } })],
          kind,
        );
        f.quarry.health = 3;
        runHunt(f, LONG, MEADOW, seed, () => {
          expect(f.quarry.health).toBeGreaterThanOrEqual(1);
          expect(f.quarry.state).not.toBe('dead');
        });
        expect(f.outcome).not.toBe('killed');
        if (f.quarry.health === 1) wounded++;
      }
      expect(wounded).toBeGreaterThan(0);
      // raněného (zdraví 1) dorazí lovec s bojem nad branou
      expect(
        SEEDS.filter((seed) => {
          const f = hunt([veteran(1)], kind);
          f.quarry.health = 1;
          runHunt(f, LONG, MEADOW, seed);
          return f.outcome === 'killed';
        }).length,
      ).toBeGreaterThanOrEqual(12);
    }
    // jelen a vlk šípem padnou dál
    for (const kind of ['stag', 'wolf'] as const) {
      const f = hunt(
        [walker(1, { pos: { x: 100, z: 0 }, skills: { bow: 80, combat: 0, riding: 0 } })],
        kind,
      );
      f.quarry.health = 0.01;
      f.quarry.state = 'stand';
      runHunt(f, 400, MEADOW, 4);
      expect(f.outcome).toBe('killed');
    }
  });

  it('šíp po smrtelném úderu v témže taktu kance ani bachyni neoživí – padnou, složil je ten, kdo udeřil', () => {
    let both = 0;
    for (const kind of ['boar', 'sow'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const f = hunt([], kind);
        // poslední bod zdraví; u zvířete zkušený pěší (rána nad branou), 40 m od něj lukostřelec –
        // rány taktu jdou podle `personId`: napřed úder, pak šíp
        Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand', health: 1 });
        addHunters(
          f,
          [
            veteran(1, { pos: { x: OUT.x + 1, z: 0 } }),
            walker(2, { pos: { x: OUT.x + 40, z: 0 }, skills: { bow: 100, combat: 0, riding: 0 } }),
          ],
          0,
        );
        tick(f, MEADOW, seed);
        // úder i šíp zasáhly zvíře v témže taktu
        if (f.quarry.hits < 2) continue;
        both++;
        expect(f.outcome).toBe('killed');
        expect(f.killer).toBe(1);
        expect(f.quarry).toMatchObject({ state: 'dead', health: 0 });
      }
    }
    expect(both).toBeGreaterThan(0);
  });

  it('šíp kanci zdraví pod 1 nezvedne', () => {
    let arrows = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const f = hunt([], 'boar');
      Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'stand', health: 0.5 });
      addHunters(
        f,
        [walker(1, { pos: { x: OUT.x + 40, z: 0 }, skills: { bow: 100, combat: 0, riding: 0 } })],
        0,
      );
      tick(f, MEADOW, seed);
      if (f.quarry.hits === 0) continue;
      arrows++;
      expect(f.quarry.health).toBe(0.5);
      expect(f.outcome).toBe('ongoing');
    }
    expect(arrows).toBeGreaterThan(0);
  });

  it('šíp trefí i druhého lovce stojícího u zvířete (seed, kde se to stane)', () => {
    const arrow = hitDamage(1, true);
    const struck: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const f = hunt([], 'stag');
      // uštvaný jelen stojí na výběhu, u něj slabý vesničan; lukostřelec 55 m od něj
      Object.assign(f.quarry, { pos: { ...OUT }, goal: null, state: 'spent', stamina: 0 });
      addHunters(
        f,
        [
          walker(1, { pos: { x: OUT.x + 55, z: 0 }, skills: { bow: 10, combat: 50, riding: 0 } }),
          footman(2, 30, { pos: { x: OUT.x + 2, z: 0 }, lineMan: false, strength: 0.1 }),
        ],
        0,
      );
      runHunt(f, 120, MEADOW, seed);
      const second = hunter(f, 2);
      if (second.hits === 0) continue;
      // jelen lovce nezraní – každá rána druhého je šíp prvního
      expect(second.health).toBeCloseTo(FULL - second.hits * arrow, 9);
      expect(hunter(f, 1).health).toBe(FULL);
      struck.push(seed);
    }
    expect(struck.length).toBeGreaterThan(0);
  });

  it('fightResult: killer první v names, padlý dead, raněný wounded, kůň v horsesLost', () => {
    const f = hunt([walker(1), walker(2), rider(3), walker(4), walker(5)], 'bear');
    // stav na konci souboje: 1 padl mrtvý, 2 padl raněný, 3 přišel o koně a medvěda složil,
    // 4 odešel na jiný rozkaz s hodinami, 5 nic necvičil
    Object.assign(hunter(f, 1), {
      state: 'down',
      killed: true,
      health: 0,
      hours: { bow: 0, combat: 1, riding: 0 },
    });
    Object.assign(hunter(f, 2), {
      state: 'down',
      killed: false,
      health: 0,
      hours: { bow: 0.5, combat: 0.5, riding: 0 },
    });
    Object.assign(hunter(f, 3), {
      mounted: false,
      strength: 1,
      horseHealth: 0,
      horseLost: true,
      // syrové hodiny 16 → strop 6 h stejným dílem
      hours: { bow: 2, combat: 8, riding: 6 },
    });
    Object.assign(hunter(f, 4), {
      left: true,
      health: 55,
      hours: { bow: 0, combat: 2, riding: 0 },
    });
    Object.assign(f, { outcome: 'killed', killer: 3 });
    Object.assign(f.quarry, { state: 'dead', health: 0 });
    const names = new Map([
      [1, 'Bořek'],
      [2, 'Čestmír'],
      [3, 'Kazimír'],
      [4, 'Dobroslav'],
      [5, 'Ctibor'],
    ]);
    const before = JSON.stringify(f);
    expect(fightResult(f, names, new Map([[3, 77]]))).toEqual({
      quarry: 'bear',
      killed: true,
      names: ['Kazimír', 'Bořek', 'Čestmír', 'Dobroslav', 'Ctibor'],
      trained: [
        { personId: 1, hours: { bow: 0, combat: 1, riding: 0 } },
        { personId: 2, hours: { bow: 0.5, combat: 0.5, riding: 0 } },
        { personId: 3, hours: { bow: 0.75, combat: 3, riding: 2.25 } },
        { personId: 4, hours: { bow: 0, combat: 2, riding: 0 } },
      ],
      casualties: [
        { personId: 1, outcome: 'dead' },
        { personId: 2, outcome: 'wounded' },
      ],
      horsesLost: [77],
    });
    // výsledek stav souboje nemění; uteklé zvíře – bez zabití a jména podle personId
    expect(JSON.stringify(f)).toBe(before);
    Object.assign(f, { outcome: 'escaped', killer: null });
    const escaped = fightResult(f, names, new Map());
    expect(escaped.killed).toBe(false);
    expect(escaped.names).toEqual(['Bořek', 'Čestmír', 'Kazimír', 'Dobroslav', 'Ctibor']);
    expect(escaped.horsesLost).toEqual([]);
  });
});
