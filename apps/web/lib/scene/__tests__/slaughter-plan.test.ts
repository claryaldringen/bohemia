import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneVillage } from '../../village-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import {
  CARCASS,
  SLAUGHTER_PHASES,
  SLAUGHTER_TIMING,
  TRESTLE,
  createSlaughterState,
  slaughterPhaseAt,
  slaughterPlan,
  slaughterPose,
  slaughterSites,
  slaughterState,
  stationCount,
  type SlaughterInput,
  type SlaughterPlan,
  type SlaughterStation,
} from '../slaughter-plan';
import { createVillagerPose } from '../villager-motion';
import { planVillagersWithCrew, type VillagerGround } from '../villager-plan';

const DAY_MS = 86_000;
const WINDOW = { startMs: 1_000_000, endMs: 1_000_000 + DAY_MS };
/** Okamžik dne jako podíl okna. */
const atF = (f: number): number => WINDOW.startMs + f * DAY_MS;

/** Domy 1–3 vchodem k jihu (+z); dům je obdélník 6 × 6 m za vchodem, ohrada skotu na severu. */
const HOMES = [
  { id: 1, door: { x: 0, z: 3.5 }, out: { x: 0, z: 1 } },
  { id: 2, door: { x: 25, z: 3.5 }, out: { x: 0, z: 1 } },
  { id: 3, door: { x: -25, z: 3.5 }, out: { x: 0, z: 1 } },
];
const inHouse = (x: number, z: number): boolean =>
  HOMES.some((h) => Math.abs(x - h.door.x) < 3.5 && z > h.door.z - 7 && z < h.door.z - 0.3);
const PEN = { minX: 40, maxX: 55, minZ: -40, maxZ: -25 };
const inPen = (x: number, z: number): boolean =>
  x > PEN.minX - 0.5 && x < PEN.maxX + 0.5 && z > PEN.minZ - 0.5 && z < PEN.maxZ + 0.5;
/** Potok v pásu z ∈ (12, 16) – nesmí se tam stát. */
const standable = (x: number, z: number): boolean =>
  !inHouse(x, z) && !inPen(x, z) && !(z > 12 && z < 16);

function input(over: Partial<SlaughterInput> = {}): SlaughterInput {
  return {
    heads: { pig: 1 },
    day: 1200,
    seed: 77,
    window: WINDOW,
    homes: HOMES,
    cattleGate: null,
    figures: 6,
    standable,
    ...over,
  };
}

const one = (plan: SlaughterPlan | null): SlaughterStation => {
  expect(plan).not.toBeNull();
  return plan!.stations[0]!;
};

describe('slaughterSites – stanoviště, druh a parta', () => {
  it('bez kusů, obydlí nebo postav žádná porážka', () => {
    expect(slaughterPlan(input({ heads: undefined }))).toBeNull();
    expect(slaughterPlan(input({ heads: {} }))).toBeNull();
    expect(slaughterPlan(input({ homes: [] }))).toBeNull();
    expect(slaughterPlan(input({ figures: 0 }))).toBeNull();
  });

  it('v zimě se zlomky 1 stanoviště, 1. 11. až 3 – nejvýš polovina postav', () => {
    expect(stationCount({ pig: 0.3, sheep: 0.2 }, 10)).toBe(1);
    expect(stationCount({ pig: 1.4, sheep: 0.8, goat: 0.3, cow: 0.4 }, 10)).toBe(3);
    expect(stationCount({ pig: 4, sheep: 3 }, 10)).toBe(3);
    expect(stationCount({ pig: 4 }, 4)).toBe(2);
    expect(stationCount({ pig: 4 }, 1)).toBe(1);
    expect(slaughterSites(input({ heads: { pig: 2, sheep: 2 }, figures: 10 }))).toHaveLength(3);
  });

  it('kozlina 2–3 m před vchodem na schůdné zemi, otevřenou stranou k vchodu', () => {
    for (let day = 1200; day < 1240; day++) {
      const st = one(slaughterPlan(input({ day })));
      const home = HOMES.find((h) => h.id === st.home)!;
      const along = (st.x - home.door.x) * home.out.x + (st.z - home.door.z) * home.out.z;
      const across = Math.abs(
        (st.x - home.door.x) * home.out.z - (st.z - home.door.z) * home.out.x,
      );
      expect(along).toBeGreaterThanOrEqual(2);
      expect(along).toBeLessThanOrEqual(3);
      expect(across).toBeLessThanOrEqual(3);
      expect(st.headingX * home.out.x + st.headingZ * home.out.z).toBeCloseTo(-1);
      for (const p of [st, st.animal, st.block, st.trough]) expect(standable(p.x, p.z)).toBe(true);
      expect(st.trestle).toBe('small');
    }
  });

  it('domácnost se střídá losem ze seedu a dne, druh losem váženým kusy', () => {
    const homes = new Set<number>();
    const species = new Map<string, number>();
    for (let day = 1200; day < 1400; day++) {
      const st = one(slaughterPlan(input({ day, heads: { pig: 3, sheep: 1 } })));
      homes.add(st.home);
      species.set(st.species, (species.get(st.species) ?? 0) + 1);
    }
    expect(homes.size).toBe(3);
    expect(species.get('pig')!).toBeGreaterThan(species.get('sheep')! * 1.8);
  });

  it('zimní zlomek kusů: stanoviště jen v podílu dní, průměr odpovídá kusům', () => {
    let days = 0;
    const N = 2000;
    for (let day = 1000; day < 1000 + N; day++) {
      if (slaughterPlan(input({ day, heads: { pig: 0.2, sheep: 0.1 } }))) days++;
    }
    expect(days / N).toBeGreaterThan(0.25);
    expect(days / N).toBeLessThan(0.35);
    // celé kusy se poráží vždy
    for (let day = 1000; day < 1050; day++) {
      expect(slaughterPlan(input({ day, heads: { pig: 1 } }))).not.toBeNull();
    }
  });

  it('kráva u branky ohrady skotu na velké kozlině, bez ohrady u domu', () => {
    const gate = { x: 47.5, z: -24.5, outX: 0, outZ: 1 };
    const st = one(slaughterPlan(input({ heads: { cow: 1 }, cattleGate: gate })));
    expect(st.atGate).toBe(true);
    expect(st.trestle).toBe('large');
    expect(Math.hypot(st.x - gate.x, st.z - gate.z)).toBeLessThanOrEqual(3 + 1e-9);
    expect(standable(st.animal.x, st.animal.z)).toBe(true);
    const home = one(slaughterPlan(input({ heads: { cow: 1 } })));
    expect(home.atGate).toBe(false);
    expect(home.trestle).toBe('large');
    expect(home.hang.lift).toBeCloseTo(TRESTLE.large.hookY - CARCASS.cow.hangTop);
  });

  it('parta podle druhu: ovce 2, prase 3, kráva 4; málo postav – řezník sám', () => {
    const crew = (heads: SlaughterInput['heads'], figures = 8): string[] =>
      one(slaughterPlan(input({ heads, figures }))).crew;
    expect(crew({ sheep: 0.5 })).toEqual(['butcher', 'bowl']);
    expect(crew({ goat: 0.5 })).toEqual(['butcher', 'bowl']);
    expect(crew({ pig: 0.5 })).toEqual(['butcher', 'bowl', 'holder']);
    expect(crew({ cow: 0.5 })).toEqual(['butcher', 'bowl', 'holder', 'helper']);
    expect(crew({ cow: 0.5 }, 1)).toEqual(['butcher']);
    // 3 stanoviště a 6 postav: každé má řezníka, zbytek do party prvních
    const plan = slaughterPlan(input({ heads: { pig: 3 }, figures: 6 }))!;
    expect(plan.stations).toHaveLength(3);
    expect(plan.stations.map((s) => s.crew.length)).toEqual([3, 2, 1]);
    // stanoviště jsou u různých domů
    expect(new Set(plan.stations.map((s) => s.home)).size).toBe(3);
  });
});

describe('slaughterState – fáze a zvíře v čase', () => {
  const pig = one(slaughterPlan(input({ heads: { pig: 1 } })));
  const sheep = one(slaughterPlan(input({ heads: { sheep: 1 } })));
  const plan = (st: SlaughterStation): SlaughterPlan => ({
    day: 1200,
    window: WINDOW,
    stations: [st],
  });
  const state = (st: SlaughterStation, f: number) =>
    slaughterState(plan(st), st, atF(f), createSlaughterState());

  it('fáze na hranicích tabulky (podíly okna dne), den se opakuje', () => {
    for (const row of SLAUGHTER_PHASES) {
      expect(slaughterPhaseAt(WINDOW, atF(row.from + 1e-6)).phase).toBe(row.phase);
      expect(slaughterPhaseAt(WINDOW, atF(row.to - 1e-6)).phase).toBe(row.phase);
    }
    expect(slaughterPhaseAt(WINDOW, atF(1.1)).phase).toBe('stun');
    expect(slaughterPhaseAt(WINDOW, atF(-0.8)).phase).toBe('bleed');
  });

  it('prase: stojí, ve 12 % padne (0,6 s), leží, při zavěšení visí', () => {
    expect(state(pig, 0.05).phase).toBe('bring');
    expect(state(pig, 0.1).phase).toBe('stun');
    expect(state(pig, 0.1).carcass.pose).toBe(1);
    const fall = SLAUGHTER_TIMING.fallAt;
    expect(state(pig, fall + 0.3 / 86).carcass.pose).toBeGreaterThan(0);
    expect(state(pig, fall + 0.3 / 86).carcass.pose).toBeLessThan(1);
    expect(state(pig, fall + 1 / 86).carcass.pose).toBe(0);
    expect(state(pig, 0.36).carcass.pose).toBe(0);
    // zvedne se na háky plynule (1,2 s): napůl zvednuté je mezi tím, kde leželo, a háky
    const hoist = SLAUGHTER_TIMING.hoistAt + SLAUGHTER_TIMING.liftS / 2 / 86;
    const rising = state(pig, hoist).carcass;
    expect(rising.pose).toBeLessThan(0);
    expect(rising.pose).toBeGreaterThan(-1);
    expect(rising.lift).toBeGreaterThan(0);
    expect(Math.hypot(rising.headingX, rising.headingZ)).toBeCloseTo(1);
    const hung = state(pig, 0.39).carcass;
    expect(hung.pose).toBe(-1);
    expect(hung.lift).toBeCloseTo(TRESTLE.small.hookY - CARCASS.pig.hangTop);
    expect(Math.hypot(hung.x - pig.x, hung.z - pig.z)).toBeLessThan(1e-9);
  });

  it('ovce a koza bez omráčení: přidržení, padne až při vykrvení, řezník bez palice', () => {
    expect(state(sheep, 0.1).phase).toBe('hold');
    expect(state(sheep, 0.13).carcass.pose).toBe(1);
    expect(state(sheep, 0.14 + 1 / 86).carcass.pose).toBe(0);
    const p = plan(sheep);
    const clips = new Set<string>();
    for (let f = 0; f < 1; f += 0.002) {
      clips.add(slaughterPose(p, sheep, 0, 1, atF(f), createVillagerPose()).clip);
    }
    expect(clips.has('build')).toBe(false);
    expect(clips.has('gut')).toBe(true);
    // prase omráčí palicí (2–3 údery před pádem)
    const blows = (f: number) => slaughterPose(plan(pig), pig, 0, 1, atF(f), createVillagerPose());
    expect(blows(SLAUGHTER_TIMING.fallAt - 0.5 / 86).clip).toBe('build');
    expect(blows(SLAUGHTER_TIMING.fallAt - 3 / 86).clip).toBe('idle');
  });

  it('rozčtvrcení: čtvrtiny mizí, kýty přibývají na prkně, nosiči je odnesou', () => {
    let quarters = 4;
    let legs = 0;
    let maxLegs = 0;
    for (let f = 0.6; f < 1; f += 0.001) {
      const s = state(pig, f);
      expect(s.carcass.quarters).toBeLessThanOrEqual(quarters);
      quarters = s.carcass.quarters;
      if (f < 0.85) expect(s.legsOnBoard).toBeGreaterThanOrEqual(legs);
      legs = s.legsOnBoard;
      maxLegs = Math.max(maxLegs, legs);
      expect(s.legsOnBoard + s.carcass.quarters).toBeLessThanOrEqual(4);
    }
    expect(state(pig, 0.63).carcass.quarters).toBe(4);
    expect(state(pig, 0.7).carcass.quarters).toBe(3);
    expect(state(pig, 0.7).carcass.cutMask).toBe(1);
    expect(state(pig, 0.84).carcass.quarters).toBe(0);
    expect(state(pig, 0.84).carcass.visible).toBe(false);
    expect(state(pig, 0.84).legsOnBoard).toBe(4);
    expect(maxLegs).toBe(4);
    expect(state(pig, 0.999).legsOnBoard).toBe(0);
  });

  it('miska jen tmavá hladina: v ruce při vykrvení, pak na zemi; necky pod zvířetem', () => {
    const p = plan(pig);
    expect(slaughterPose(p, pig, 1, 1, atF(0.25), createVillagerPose()).clip).toBe('bleed');
    expect(state(pig, 0.25).bowlOnGround).toBe(false);
    expect(state(pig, 0.5).bowlOnGround).toBe(true);
    expect(Math.hypot(pig.trough.x - pig.hang.x, pig.trough.z - pig.hang.z)).toBeLessThan(1e-9);
    const alone = one(slaughterPlan(input({ heads: { pig: 1 }, figures: 1 })));
    expect(alone.bowl).toBeNull();
  });

  it('řezník při vyvržení stojí z boku visícího zvířete, miska vedle necek u kozliny', () => {
    for (const st of [pig, one(slaughterPlan(input({ heads: { cow: 1 } })))]) {
      const p = plan(st);
      const pose = slaughterPose(p, st, 0, 1, atF(0.5), createVillagerPose());
      // v osách stanoviště: side podél bidla, front k vchodu
      const dx = pose.x - st.x;
      const dz = pose.z - st.z;
      const front = dx * st.headingX + dz * st.headingZ;
      const side = dx * st.headingZ - dz * st.headingX;
      expect(Math.abs(front)).toBeLessThan(0.3);
      expect(Math.abs(side)).toBeGreaterThan(1);
      const bowl = st.bowl!;
      const bx = bowl.x - st.x;
      const bz = bowl.z - st.z;
      expect(Math.hypot(bx, bz)).toBeLessThan(1.3);
    }
  });

  it('klipy fází: vykrvení nůž v kleku, vyvržení vestoje, rozčtvrcení sekera, odnos masa', () => {
    const p = plan(pig);
    const butcher = (f: number): string =>
      slaughterPose(p, pig, 0, 1, atF(f), createVillagerPose()).clip;
    expect(butcher(0.2)).toBe('butcher');
    expect(butcher(0.5)).toBe('gut');
    expect(butcher(0.63)).toBe('fell');
    const carried = new Set<string>();
    for (let f = 0.85; f < 1; f += 0.002) {
      for (let m = 0; m < pig.crew.length; m++) {
        carried.add(slaughterPose(p, pig, m, 1, atF(f), createVillagerPose()).clip);
      }
    }
    expect(carried.has('carry-meat')).toBe(true);
    // na konci dne jsou nosiči doma (uvnitř)
    for (let m = 0; m < pig.crew.length; m++) {
      const end = slaughterPose(p, pig, m, 1, atF(0.999), createVillagerPose());
      expect(end.hidden).toBe(true);
      expect(Math.hypot(end.x - pig.door.x, end.z - pig.door.z)).toBeLessThan(1e-6);
    }
  });

  it('determinismus: stejný vstup → stejný plán a stejná póza', () => {
    const a = slaughterPlan(input({ heads: { pig: 1.4, sheep: 0.8, cow: 0.4 }, figures: 9 }));
    const b = slaughterPlan(input({ heads: { pig: 1.4, sheep: 0.8, cow: 0.4 }, figures: 9 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const st = a!.stations[0]!;
    for (const f of [0.03, 0.2, 0.5, 0.7, 0.9]) {
      const p1 = slaughterPose(a!, st, 0, 1.1, atF(f), createVillagerPose());
      const p2 = slaughterPose(a!, st, 0, 1.1, atF(f), createVillagerPose());
      expect(p1).toEqual(p2);
    }
  });
});

// --- postavy vsi --------------------------------------------------------------------------

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: () => null,
  treesIn: () => [],
};

const house = (id: number, x: number, z: number) => ({
  id,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  inhabited: true,
});

const PEOPLE: RolePerson[] = [
  { id: 101, age: 40, sex: 'male', home: 1, spouse: 102 },
  { id: 102, age: 38, sex: 'female', home: 1, spouse: 101 },
  { id: 103, age: 15, sex: 'male', home: 1, father: 101, mother: 102 },
  { id: 104, age: 10, sex: 'female', home: 1, father: 101, mother: 102 },
  { id: 201, age: 30, sex: 'male', home: 2, spouse: 202 },
  { id: 202, age: 29, sex: 'female', home: 2, spouse: 201 },
  { id: 301, age: 27, sex: 'male', home: 3 },
  { id: 302, age: 22, sex: 'female', home: 3 },
];

function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({ ...p, role: roles.get(p.id)! }));
}

function village(slaughter: boolean, withPersons = true): SceneVillage {
  const shares: LaborShare[] = [
    { activity: 'domestic', target: { kind: 'village' }, manDays: 3 },
    ...(slaughter
      ? [{ activity: 'slaughter' as const, target: { kind: 'village' as const }, manDays: 4 }]
      : []),
  ];
  return {
    dwellings: [house(1, 0, 0), house(2, 25, 0), house(3, -25, 0)],
    fields: [],
    labor: {
      day: 1200,
      month: 12,
      people: { children: 1, adults: 7, elders: 0 },
      shares,
      ...(slaughter ? { slaughter: { pig: 0.4 } } : {}),
      ...(withPersons ? { persons: persons() } : {}),
    },
  };
}

const planOf = (v: SceneVillage, withClock = true) =>
  planVillagersWithCrew(v, GROUND, {
    seed: 5,
    herds: 0,
    ...(withClock ? { dayWindow: () => WINDOW } : {}),
  });

describe('planVillagersWithCrew – parta porážky', () => {
  it('bez `labor.slaughter` nebo bez hodin světa žádná porážka', () => {
    expect(planOf(village(false)).slaughter).toBeNull();
    expect(planOf(village(true), false).slaughter).toBeNull();
    expect(planOf(village(false)).people.some((p) => p.key.startsWith('slaughter-crew:'))).toBe(
      false,
    );
  });

  it('parta jsou dospělí 16+ – řezník muž, s miskou žena –, nikdo není dvakrát', () => {
    const plan = planOf(village(true));
    const st = plan.slaughter!.stations[0]!;
    const crew = plan.people.filter((p) => p.key.startsWith('slaughter-crew:'));
    expect(crew).toHaveLength(st.crew.length);
    expect(st.crew[0]).toBe('butcher');
    const byId = new Map(PEOPLE.map((p) => [p.id, p]));
    for (const p of crew) expect(byId.get(p.person!)!.age).toBeGreaterThanOrEqual(16);
    const butcher = byId.get(crew[0]!.person!)!;
    expect(butcher.sex).toBe('male');
    expect(butcher.home).toBe(st.home);
    if (st.crew[1] === 'bowl') expect(byId.get(crew[1]!.person!)!.sex).toBe('female');
    const ids = plan.people.flatMap((p) => (p.person !== undefined ? [p.person] : []));
    expect(new Set(ids).size).toBe(ids.length);
    // postavy party jdou podle scénáře porážky
    const pose = crew[0]!.pose((atF(0.2) - LIVESTOCK_EPOCH_MS) / 1000, [], createVillagerPose());
    expect(pose.clip).toBe('butcher');
  });

  it('bez lidí ve scéně parta podle druhu a podílu', () => {
    const plan = planOf(village(true, false));
    const crew = plan.people.filter((p) => p.key.startsWith('slaughter-crew:'));
    expect(plan.slaughter!.stations[0]!.crew).toEqual(['butcher', 'bowl', 'holder']);
    expect(crew.map((p) => p.kind)).toEqual(['man', 'woman', crew[2]!.kind]);
  });
});
