import { beforeAll, describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  obstaclesOf,
  premiumFeaturesOf,
  tileOfWorldPoint,
  type Landscape,
  type PremiumType,
} from '../../landscape';
import { foundVillage } from '../actions';
import { newWorkshop, workCrafts, workshopLabor } from '../crafts';
import { foundedState } from '../founding';
import { ORE_KG_PER_TOOL_KG, SMELT } from '../iron-rates';
import { squareYieldKg } from '../orchard';
import {
  dugMaterialFactor,
  markSunnyOrchards,
  premiumSacredHappiness,
  premiumSites,
} from '../premium-effects';
import { NO_CRAFTS } from '../productivity';
import { CLAY, CRAFT_BASE, PREMIUM_EFFECTS } from '../rules';
import { gridSquare, squareFlags } from '../placement-squares';
import { sacredHappiness } from '../sacred';
import { chooseDugSite, chooseOreSite } from '../smith-supply';
import { builtTrail, villageTrails } from '../trail';
import type { Craft, Dwelling, OrchardSquare, OreSite, Person, VillageState } from '../types';
import { freeVillageSite } from '../village-site';
import { withBuiltFirstDwelling } from './village-fixtures';

// Účinky prémiových krajin „hned“ (premium-landscapes.md – Typy krajin, sloupec „Hned“) přes
// existující mechaniky: bohatá ruda a dobrá hlína, sad na jižním svahu, posvátná hora, stezka
// kostry přes brod. Ves v krajině bez typu je bit po bitu stejná – hlídají zlaté otisky vsí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const WINTER = at(601, 1, 10);
const SMITH = 51;
const POTTER = 52;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  day: number,
  extra: Partial<Person> = {},
): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR) - 10,
  dwellingId,
  ...extra,
});

/** Ves se čtyřmi dospělými v obydlí na `at`. */
function village(day: number, at = { x: 0, z: 0 }): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { ...at, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19].map((age, i) =>
    person(2 + i, age, 1, day, { sex: i % 2 === 0 ? 'male' : 'female' }),
  );
  s.constructions = [];
  s.storesKg = 5_000;
  s.lastDay = day;
  s.nextId = 1000;
  s.crafts = { charcoalKg: 10_000, potteryKg: 0 };
  return s;
}

function addWorkshop(s: VillageState, craft: Craft, id: number, x = 40, z = 40): Dwelling {
  const dwelling: Dwelling = {
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { x, z, rotation: 0 },
    workshop: newWorkshop(craft),
  };
  s.dwellings.push(dwelling);
  s.people.push(person(id * 10, 36, id, s.lastDay, { sex: 'male' }));
  s.people.push(person(id * 10 + 1, 30, id, s.lastDay, { sex: 'female' }));
  return dwelling;
}

const site = (rich: boolean): OreSite => ({
  x: 100,
  z: 0,
  minedKg: 0,
  day: WINTER,
  walkM: 100,
  ...(rich ? { rich: true as const } : {}),
});

const landscapes = new Map<PremiumType, Landscape>();
const premium = (type: PremiumType): Landscape => landscapes.get(type)!;

beforeAll(() => {
  for (const type of [
    'iron-ore',
    'fine-clay',
    'south-slopes',
    'sacred-mountain',
    'sacred-spring',
    'ford-hill',
  ] as const) {
    landscapes.set(type, generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, type).landscape);
  }
}, 120_000);

describe('bohatá železná ruda (premium-landscapes.md)', () => {
  it('kovář na bohatém rudišti potřebuje 4 kg rudy na kg nástrojů místo 8', () => {
    expect(ORE_KG_PER_TOOL_KG * dugMaterialFactor({ rich: true }, 'ore')).toBeCloseTo(4, 12);
    const run = (rich: boolean): { bloom: number; ore: number } => {
      const s = village(WINTER);
      const smith = addWorkshop(s, 'smith', SMITH);
      smith.workshop!.oreKg = 500;
      smith.workshop!.oreSite = site(rich);
      s.lastDay += 1;
      workCrafts(s, s.lastDay, null, NO_CRAFTS, 1);
      return { bloom: s.crafts!.bloomKg!, ore: 500 - smith.workshop!.oreKg! };
    };
    const plain = run(false);
    const rich = run(true);
    expect(rich.bloom).toBeGreaterThan(0);
    expect(rich.bloom).toBeCloseTo(plain.bloom, 9);
    expect(plain.ore).toBeCloseTo(plain.bloom * SMELT.oreKgPerKg, 9);
    expect(rich.ore).toBeCloseTo(rich.bloom * SMELT.oreKgPerKg * PREMIUM_EFFECTS.richOre, 9);
  });

  it('rudiště je na prvku typu – bohaté, nevyčerpá se; v krajině bez typu obyčejné', () => {
    const l = premium('iron-ore');
    const ore = premiumSites(l, 'iron-ore')[0]!;
    const home = freeVillageSite(l)!;
    const s = village(WINTER, home);
    const smith = addWorkshop(s, 'smith', SMITH, home.x + 20, home.z);
    const chosen = chooseOreSite(s, smith, WINTER, l, obstaclesOf(l))!;
    expect(chosen).toMatchObject({ rich: true });
    expect(Math.hypot(chosen.x - ore.x, chosen.z - ore.z)).toBeLessThan(0.01);
    // hrnčíř na rudišti nekope (místa dílen se nepřekrývají) a hlína tu bohatá není
    smith.workshop!.oreSite = chosen;
    const potter = addWorkshop(s, 'potter', POTTER, home.x - 20, home.z);
    expect(chooseDugSite(s, potter, WINTER, l, 'clay', obstaclesOf(l))?.rich).toBeUndefined();
  });
});

describe('dobrá keramická hlína (premium-landscapes.md)', () => {
  it('hrnčíř na bohatém hliništi potřebuje poloviční hlínu na kg keramiky', () => {
    const run = (rich: boolean): { pottery: number; clay: number } => {
      const s = village(WINTER);
      const potter = addWorkshop(s, 'potter', POTTER);
      potter.workshop!.clayKg = 300;
      potter.workshop!.fuelKg = 5_000;
      potter.workshop!.claySite = site(rich);
      s.lastDay += 1;
      workCrafts(s, s.lastDay, null, NO_CRAFTS, 1);
      return { pottery: s.crafts!.potteryKg, clay: 300 - potter.workshop!.clayKg! };
    };
    const plain = run(false);
    const rich = run(true);
    expect(rich.pottery).toBeGreaterThan(0);
    expect(rich.pottery).toBeCloseTo(plain.pottery, 9);
    expect(plain.clay).toBeCloseTo(plain.pottery * CLAY.kgPerPotteryKg, 9);
    expect(rich.clay).toBeCloseTo(rich.pottery * CLAY.kgPerPotteryKg * PREMIUM_EFFECTS.fineClay, 9);
  });

  it('hliniště je na prvku typu', () => {
    const l = premium('fine-clay');
    const clay = premiumSites(l, 'clay')[0]!;
    const home = freeVillageSite(l)!;
    const s = village(WINTER, home);
    const potter = addWorkshop(s, 'potter', POTTER, home.x + 20, home.z);
    expect(workshopLabor(s, WINTER + 1, POTTER, 0).craft).toBeGreaterThan(0);
    const chosen = chooseDugSite(s, potter, WINTER, l, 'clay', obstaclesOf(l))!;
    expect(chosen).toMatchObject({ rich: true });
    expect(Math.hypot(chosen.x - clay.x, chosen.z - clay.z)).toBeLessThan(0.01);
  });
});

describe('teplé jižní svahy (premium-landscapes.md)', () => {
  it('sad na svahu typu dá o čtvrtinu víc jablek, jinde stejně', () => {
    const l = premium('south-slopes');
    const slope = premiumSites(l, 'slope')[0]!;
    const onSlope = tileOfWorldPoint(l, slope.x, slope.z)!;
    const s = village(WINTER);
    const square = (cell: { x: number; y: number }): OrchardSquare => ({
      cell,
      areaM2: 100,
      distanceM: 50,
      plantingCost: 1,
      plantingDone: 1,
      plantedDay: WINTER - 20 * 365,
    });
    s.orchards = [
      { id: 7, squares: [square({ x: onSlope.x, y: onSlope.y }), square({ x: 0, y: 0 })] },
    ];
    const plain = s.orchards[0]!.squares.map((q) => squareYieldKg(q, WINTER));
    markSunnyOrchards(s, l);
    markSunnyOrchards(s, l);
    const [sunny, shade] = s.orchards[0]!.squares;
    expect(sunny!.sunny).toBe(true);
    expect(shade!.sunny).toBeUndefined();
    expect(squareYieldKg(sunny!, WINTER)).toBeCloseTo(plain[0]! * 1.25, 9);
    expect(squareYieldKg(shade!, WINTER)).toBe(plain[1]);
    // krajina jiného typu sady nemění
    const other = structuredClone(s.orchards[0]!.squares[1]!);
    markSunnyOrchards(s, premium('iron-ore'));
    expect(s.orchards[0]!.squares[1]).toEqual(other);
  });
});

describe('posvátná hora (premium-landscapes.md)', () => {
  it('vrchol hory je posvátné místo jako háj – nejvýš do stropů posvátných míst', () => {
    expect(premiumSacredHappiness(premium('sacred-mountain'))).toBe(PREMIUM_EFFECTS.sacredPlace);
    expect(premiumSacredHappiness(premium('iron-ore'))).toBe(0);
    expect(premiumSacredHappiness(null)).toBe(0);
    const s = village(WINTER);
    expect(sacredHappiness(s, WINTER, null, PREMIUM_EFFECTS.sacredPlace)).toBe(
      sacredHappiness(s, WINTER, null) + PREMIUM_EFFECTS.sacredPlace,
    );
    // dva lepší háje – hora se mezi dva nejlepší nevejde
    s.groves = [
      { id: 1, day: WINTER, x: 0, z: 0, cells: [], oaks: 16 },
      { id: 2, day: WINTER, x: 0, z: 0, cells: [], oaks: 12 },
    ];
    expect(sacredHappiness(s, WINTER, null, PREMIUM_EFFECTS.sacredPlace)).toBe(
      sacredHappiness(s, WINTER, null),
    );
  });
});

describe('posvátný pramen (premium-landscapes.md)', () => {
  it('pramen přidá štěstí a pole, sad ani hřbitov na něj nesmí – jako na vodu', () => {
    const l = premium('sacred-spring');
    expect(premiumSacredHappiness(l)).toBe(PREMIUM_EFFECTS.sacredPlace);
    const spring = premiumSites(l, 'spring')[0]!;
    const cell = tileOfWorldPoint(l, spring.x, spring.z)!;
    const flags = squareFlags(l, null, []);
    expect(flags(gridSquare(l, undefined, { x: cell.x, y: cell.y })).water).toBe(true);
    // v krajině bez pramene týž čtverec vodou není
    const plain = premium('iron-ore');
    const same = squareFlags(
      plain,
      null,
      [],
    )(gridSquare(plain, undefined, { x: cell.x, y: cell.y }));
    expect(same.water).toBe(same.ground.water);
  });
});

describe('vyvýšenina nad brodem se stezkou (premium-landscapes.md – Kostra světa)', () => {
  it('ves má od založení pevnou cestu po stezce a hotovou zemskou stezku v obou směrech', () => {
    const l = premium('ford-hill');
    const obstacles = obstaclesOf(l);
    const route = premiumFeaturesOf(l)!.sites.find((s) => s.kind === 'route')!;
    expect(route.line!.length).toBeGreaterThan(1);
    const dwelling = freeVillageSite(l, obstacles)!;
    const founded = foundedState(9, { landscape: l, obstacles, today: WINTER, dwelling });
    expect(founded.ok).toBe(true);
    const s = founded.ok ? founded.state : null!;
    const trails = villageTrails(s);
    expect(trails).toHaveLength(2);
    expect(trails[0]!.direction).not.toBe(trails[1]!.direction);
    for (const trail of trails) {
      expect(builtTrail(s, trail.direction)).toBe(trail);
      expect(trail.pieces.length).toBeGreaterThan(0);
      for (const piece of trail.pieces) {
        const road = s.roads!.roads.find((r) => r.id === piece.roadId)!;
        expect(road.grade).toBe('improved');
        expect(road.swath).toBe(true);
      }
    }
    // v krajině bez typu ves stezku nemá
    const plain = generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS).landscape;
    const home = freeVillageSite(plain)!;
    const average = foundedState(9, { landscape: plain, today: WINTER, dwelling: home });
    expect(average.ok && villageTrails(average.state)).toEqual([]);
  });
});
