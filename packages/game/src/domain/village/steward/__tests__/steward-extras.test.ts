import { stewardOutlook, type StewardOutlook } from '../steward-outlook';
import { youngsterHerders } from '../../livestock/herding';
import { beforeAll, describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundOrchard, foundVillage } from '../../core/actions';
import { DIET } from '../../core/diet';
import { fruitTargetKg } from '../../buildings/fruit-target';
import { orchardAreaM2, villageOrchards } from '../../buildings/orchard';
import { APPLE_FOOD_VALUE, ORCHARD } from '../../rules';
import { bufferFill, yearlyFoodNeed } from '../../fields/field-food';
import { fieldWorkPerHa, NO_CRAFTS } from '../../core/productivity';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { fieldStoresOutlook } from '../../core/simulate-plan';
import { planSettlement } from '../steward-plan';
import { newSteward } from '../steward-state';
import {
  extraSteps,
  orchardStep,
  penStep,
  roadApplesStep,
  roadStep,
  roadUpgradeSavedPerYear,
  sacredLaborGainPerYear,
  sacredStep,
  threshingStep,
} from '../steward-extras';
import {
  inStewardWindows,
  laborBudget,
  stewardMode,
  tileCell,
  type StewardContext,
  type StewardMode,
} from '../steward';
import { craftCoverage } from '../../crafts/crafts';
import { herdsOverRoom, penCapacity } from '../../livestock/pens';
import { monthInWindow } from '../../buildings/orchard';
import { ORCHARD_PLANTING_WINDOWS, THRESHING } from '../../rules/rules-fields';
import { SACRED_BUILDINGS } from '../../rules/rules-people';
import { laborPerDay } from '../../people/people';
import { cellHa } from '../steward-land';
import { BUILD_COSTS } from '../../buildings/costs';
import { roadUpgradeCost } from '../../roads/road-upgrades';
import { fieldCapacity } from '../../fields/field-capacity';
import { planWagonRoad, wagonPlanInputOf } from '../../roads/wagon-road';
import type { Road, VillageState } from '../../types';
import { defaultChurchDims } from '../../buildings/church-geometry';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Kroky 5 až 10 dne správce (steward.md – Ostatní stavby): hřbitov, humno, ohrady, sad, posvátná
// místa a cesty – spouštěče, okna roku, režimy a sdílený rozpočet práce.

const YEAR = 365;
/** Délka běhu zdravé vsi (let) – sad do ≈ 10 let. */
const HEALTHY_YEARS = 11;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

function village(day: number): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, true) };
}

/** Den správce v kalendářním dni (nejbližší dělitelný `everyDays` po `y. m. d.`). */
function dayOn(year: number, month: number, d: number): number {
  return Math.ceil(dayIndexOf({ year, month, day: d }) / STEWARD.everyDays) * STEWARD.everyDays;
}

/** Výhled bez úzkého hrdla v práci a osivu (cíl polí jako dřív). */
const OPEN_OUTLOOK: StewardOutlook = {
  laborHa: Infinity,
  workableHa: Infinity,
  sowHa: Infinity,
  harvestHa: Infinity,
  threshHa: Infinity,
  seedHa: Infinity,
  landHa: 0,
  bottleneck: 'land',
  lasting: 'land',
  workPerHa: 0,
  landPeople: 0,
  sustainablePeople: 0,
};

function ctxOf(day: number, mode: StewardMode = 'growth'): StewardContext {
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage: NO_CRAFTS,
    mode,
    outlook: OPEN_OUTLOOK,
  };
}

/** Ves dopočítaná do dne `day` s hotovým plánem; volná práce štědrá (rozpočet práce nebrání). */
function planned(state: VillageState): VillageState {
  let s = state;
  for (let k = 0; k < 12 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  s.commonLaborHistory = Array.from({ length: 30 }, () => 60);
  return s;
}

const kinds = (s: VillageState): string[] => s.constructions.map((c) => c.kind);

/** Štěstí vsi `value` (bez úmrtí a dřiny v paměti). */
function setMood(s: VillageState, value: number): void {
  s.happiness = { value, deaths: [], toil: [] };
}

/** Rozestavěná ohrada druhu `species`. */
const penStarted = (s: VillageState, species: string): boolean =>
  s.constructions.some(
    (c) => c.kind === 'pen' && s.pens?.find((p) => p.id === c.penId)?.species === species,
  );

/** Kopie vsi s volnou prací, po které v rozpočtu zbude právě `left` člověkodní. */
function withLeft(state: VillageState, left: number): VillageState {
  const s = structuredClone(state);
  const perDay = (laborBudget(s).remaining + left) / STEWARD.laborHorizonDays;
  s.commonLaborHistory = Array.from({ length: 30 }, () => perDay);
  return s;
}

describe('steward-extras – hřbitov', () => {
  it('po křtu rodu staví hřbitov jen u kostela', () => {
    const young = planned(withBuiltFirstDwelling(village(SEPT)));
    const slot = young.steward!.plan!.slots.cemetery![0]!;
    const cell = tileCell(landscape, slot);
    const c = tileCenterWorld(landscape, cell.x, cell.y);
    const baptized = (church: boolean): VillageState => {
      const s = structuredClone(young);
      s.faith = { rodBaptizedDay: SEPT - 1 } as VillageState['faith'];
      if (church) {
        // kostel o pár metrů vedle čtverce – jeho hřbitůvek sousedí se čtvercem
        s.churches = [
          {
            id: 900,
            type: 'chancel',
            dims: defaultChurchDims('chancel'),
            position: { x: c.x + 40, z: c.z, rotation: 0 },
            finishedDay: SEPT - 1,
          },
        ];
      }
      return s;
    };
    const without = baptized(false);
    extraSteps(without, ctxOf(SEPT));
    expect(kinds(without)).not.toContain('cemetery');
    const withChurch = baptized(true);
    extraSteps(withChurch, ctxOf(SEPT));
    expect(kinds(withChurch)).toContain('cemetery');
  });

  it('po první zemnici hned (i v Nouzi); bez zemnice ne', () => {
    const young = planned(withBuiltFirstDwelling(village(SEPT)));
    for (const mode of ['emergency', 'recovery', 'growth'] as const) {
      const s = structuredClone(young);
      extraSteps(s, ctxOf(SEPT, mode));
      expect(kinds(s)).toContain('cemetery');
      expect(s.steward?.built).toContain(s.constructions.find((c) => c.kind === 'cemetery')!.id);
    }
    const none = planned(village(SEPT));
    extraSteps(none, ctxOf(SEPT));
    expect(kinds(none)).not.toContain('cemetery');
  });

  it('rozšíření o čtverec, až když volná místa nestačí na graveYears; v Nouzi ne', () => {
    let s = planned(withBuiltFirstDwelling(village(SEPT)));
    extraSteps(s, ctxOf(SEPT));
    // hřbitov se dělí o práci s ostatními stavbami správce – dopočet, dokud nestojí
    for (let to = SEPT + 80; to <= SEPT + 240 && s.cemeteries?.[0]?.builtDay == null; to += 20) {
      s = advanceVillage(s, to, obstacles, landscape);
    }
    const cem = s.cemeteries?.[0];
    expect(cem?.builtDay).not.toBeNull();
    const done = planned(s);
    const cemeteries = (x: VillageState): number =>
      x.constructions.filter((c) => c.kind === 'cemetery').length;
    extraSteps(done, ctxOf(done.lastDay + 1));
    expect(cemeteries(done)).toBe(0);
    // místa dochází
    const full = structuredClone(done);
    full.cemeteries![0]!.graves = full.cemeteries![0]!.squares.length * 56;
    const emergency = structuredClone(full);
    extraSteps(emergency, ctxOf(done.lastDay + 1, 'emergency'));
    expect(cemeteries(emergency)).toBe(0);
    extraSteps(full, ctxOf(done.lastDay + 1));
    expect(cemeteries(full)).toBe(1);
    // rozšíření stávajícího hřbitova sousedním čtvercem, ne druhý hřbitov
    expect(full.cemeteries).toHaveLength(1);
    const squares = full.cemeteries![0]!.squares.map((q) => q.cell);
    expect(squares).toHaveLength(done.cemeteries![0]!.squares.length + 1);
    const added = squares.at(-1)!;
    expect(
      squares.slice(0, -1).some((q) => Math.abs(q.x - added.x) + Math.abs(q.y - added.y) === 1),
    ).toBe(true);
    // bez sousedního slotu v plánu správce hřbitov nerozšíří (druhý by nezaložil)
    const apart = structuredClone(done);
    apart.cemeteries![0]!.graves = apart.cemeteries![0]!.squares.length * 56;
    const edge = new Set(
      apart.cemeteries![0]!.squares.flatMap(({ cell }) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dy]) => (cell.y + dy!) * landscape.size + cell.x + dx!),
      ),
    );
    apart.steward!.plan!.slots.cemetery = (apart.steward!.plan!.slots.cemetery ?? []).filter(
      (t) => !edge.has(t),
    );
    extraSteps(apart, ctxOf(done.lastDay + 1));
    expect(cemeteries(apart)).toBe(0);
  });

  it('plán sestavený až po hřbitově dává sloty u jeho čtverců – plné hřbitovy se rozšíří', () => {
    let s = planned(withBuiltFirstDwelling(village(SEPT)));
    extraSteps(s, ctxOf(SEPT));
    for (let to = SEPT + 80; to <= SEPT + 240 && s.cemeteries?.[0]?.builtDay == null; to += 20) {
      s = advanceVillage(s, to, obstacles, landscape);
    }
    const full = structuredClone(s);
    full.cemeteries![0]!.graves = full.cemeteries![0]!.squares.length * 56;
    // nový plán (přepočet po letech) – semeno hřbitova se v něm hledá znovu
    delete full.steward!.plan;
    const replanned = planned(full);
    extraSteps(replanned, ctxOf(replanned.lastDay + 1));
    expect(replanned.constructions.filter((c) => c.kind === 'cemetery')).toHaveLength(1);
    expect(replanned.cemeteries).toHaveLength(1);
  });
});

describe('steward-extras – humno, ohrady, posvátná místa a cesty', () => {
  let grown: VillageState;
  beforeAll(() => {
    grown = advanceVillage(
      planned(withBuiltFirstDwelling(village(SEPT))),
      SEPT + 3 * YEAR,
      obstacles,
      landscape,
    );
    grown = planned(grown);
    // posvátná místa, která ves za tři roky má (dub, háj, modla), testy návratnosti nepočítají –
    // přínos stavby se měří proti vsi bez nich
    delete grown.sacredOaks;
    delete grown.groves;
    delete grown.sacredBuildings;
    grown.constructions = grown.constructions.filter(
      (c) => c.kind !== 'idol' && c.kind !== 'shrine',
    );
  }, 120_000);

  /** Příští den správce v daném kalendářním měsíci po stavu `grown`. */
  const at = (month: number, d = 5): number => {
    const year = dateOfDayIndex(grown.lastDay).year + 1;
    return Math.max(grown.lastDay + 1, dayOn(year, month, d));
  };

  it('humno: v Růstu i Obnově před žněmi; ne v Nouzi, ne po 31. 7., ne s humnem', () => {
    expect(grown.parts.length).toBeGreaterThan(0);
    const run = (month: number, mode: StewardMode): string[] => {
      const s = structuredClone(grown);
      s.threshingFloors = [];
      s.constructions = s.constructions.filter((c) => c.kind !== 'threshing-floor');
      extraSteps(s, ctxOf(at(month), mode));
      return kinds(s);
    };
    expect(run(4, 'growth')).toContain('threshing-floor');
    expect(run(4, 'recovery')).toContain('threshing-floor');
    expect(run(4, 'emergency')).not.toContain('threshing-floor');
    expect(run(8, 'growth')).not.toContain('threshing-floor');
  });

  it('rozpočet práce je sdílený – bez volné práce nestaví nic (kromě prvního hřbitova)', () => {
    const s = structuredClone(grown);
    s.threshingFloors = [];
    s.commonLaborHistory = [];
    const before = s.constructions.length;
    extraSteps(s, ctxOf(at(4)));
    expect(s.constructions.length).toBe(before);
  });

  it('ohrada skotu pro plné stádo; mimo okno (žně) ne', () => {
    const base = structuredClone(grown);
    base.pens = [];
    base.livestock = {
      ...(base.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
      herds: { sheep: 0, goat: 0, pig: 0, cow: 4 },
    } as NonNullable<VillageState['livestock']>;
    const spring = structuredClone(base);
    extraSteps(spring, ctxOf(at(3)));
    expect(spring.constructions.some((c) => c.kind === 'pen')).toBe(true);
    const harvest = structuredClone(base);
    extraSteps(harvest, ctxOf(at(8)));
    expect(harvest.constructions.some((c) => c.kind === 'pen')).toBe(false);
  });

  it('plné stádo nad místy na člověka dostane další ohradu druhu (Martin 22. 11. 2026)', () => {
    const s = structuredClone(grown);
    s.pens = (s.pens ?? []).filter((p) => p.builtDay !== null);
    s.constructions = s.constructions.filter((c) => c.kind !== 'pen');
    if (!s.pens.some((p) => p.species === 'cattle')) penStep(s, ctxOf(at(3)));
    const cattle = s.pens.find((p) => p.species === 'cattle') ?? s.pens[0]!;
    s.constructions = s.constructions.filter((c) => c.kind !== 'pen');
    s.pens = [{ ...cattle, species: 'cattle', builtDay: cattle.builtDay ?? 0 }];
    // místa skotu už přesahují 0,25 na člověka, stádo je ale plné – ohrada přibude
    s.people = s.people.slice(0, 2);
    expect(penCapacity(s).cow).toBeGreaterThan(s.people.length * 0.25);
    s.livestock = {
      ...(s.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
      herds: { sheep: 0, goat: 0, pig: 0, cow: penCapacity(s).cow + 10 },
    } as NonNullable<VillageState['livestock']>;
    expect(herdsOverRoom(s)).toContain('cow');
    penStep(s, ctxOf(at(3)));
    expect(penStarted(s, 'cattle')).toBe(true);
  });

  it('modla podle návratnosti: v Růstu i v Obnově ano, v Nouzi ne', () => {
    const ctx = ctxOf(at(10));
    const growth = structuredClone(grown);
    sacredStep(growth, ctx);
    expect(kinds(growth).filter((k) => k === 'idol')).toHaveLength(1);
    const recovery = structuredClone(grown);
    extraSteps(recovery, ctxOf(ctx.day, 'recovery'));
    expect(kinds(recovery)).toContain('idol');
    const emergency = structuredClone(grown);
    extraSteps(emergency, ctxOf(ctx.day, 'emergency'));
    expect(kinds(emergency)).not.toContain('idol');
    // štěstí 100 – modla práci nepřidá
    const happy = structuredClone(grown);
    setMood(happy, 100);
    sacredStep(happy, ctx);
    expect(kinds(happy)).not.toContain('idol');
  });

  it('přínos posvátné stavby: body štěstí × násobek práce × roční práce dospělých', () => {
    const day = at(10);
    const s = structuredClone(grown);
    const adults = s.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
    expect(adults).toBeGreaterThan(0);
    setMood(s, 50);
    // nad 50: bod štěstí = 0,1 / 50 práce
    expect(sacredLaborGainPerYear(s, day, 'idol', null)).toBeCloseTo(8 * 0.002 * adults * YEAR, 6);
    expect(sacredLaborGainPerYear(s, day, 'shrine', null)).toBeCloseTo(
      25 * 0.002 * adults * YEAR,
      6,
    );
    // pod 50 dvakrát strmější (0,2 / 50 na bod)
    setMood(s, 30);
    expect(sacredLaborGainPerYear(s, day, 'idol', null)).toBeCloseTo(8 * 0.004 * adults * YEAR, 6);
    // strop štěstí 100 ořízne přínos
    setMood(s, 96);
    expect(sacredLaborGainPerYear(s, day, 'idol', null)).toBeCloseTo(4 * 0.002 * adults * YEAR, 6);
    // strop posvátných míst (+40): dvě modly a svatyně = 41 → nic dalšího
    setMood(s, 50);
    const at0 = { x: 0, z: 0, rotation: 0 };
    s.sacredBuildings = [
      { id: 9001, kind: 'idol', position: at0, builtDay: 0 },
      { id: 9002, kind: 'idol', position: at0, builtDay: 0 },
      { id: 9003, kind: 'shrine', position: at0, builtDay: 0 },
    ];
    expect(sacredLaborGainPerYear(s, day, 'idol', null)).toBe(0);
  });

  it('svatyně v Obnově jen ve vsi, které se do 5 let vrátí; v Růstu i v malé', () => {
    const day = at(10);
    const base = structuredClone(grown);
    const at0 = { x: 0, z: 0, rotation: 0 };
    base.sacredBuildings = [
      { id: 9001, kind: 'idol', position: at0, builtDay: 0 },
      { id: 9002, kind: 'idol', position: at0, builtDay: 0 },
    ];
    setMood(base, 66);
    const yearly = sacredLaborGainPerYear(base, day, 'shrine', null);
    const cost = SACRED_BUILDINGS.shrine.laborManDays;
    expect(yearly * STEWARD.sacredPaybackYears.growth).toBeGreaterThanOrEqual(cost);
    const recovery = structuredClone(base);
    sacredStep(recovery, ctxOf(day, 'recovery'));
    expect(kinds(recovery).includes('shrine')).toBe(
      yearly * STEWARD.sacredPaybackYears.recovery >= cost,
    );
    // jen jeden dospělý: v Obnově ne
    const small = structuredClone(base);
    let kept = false;
    small.people = small.people.filter((p) => {
      if (laborPerDay(p, day) <= 0) return true;
      if (kept) return false;
      kept = true;
      return true;
    });
    expect(sacredLaborGainPerYear(small, day, 'shrine', null) * 5).toBeLessThan(cost);
    sacredStep(small, ctxOf(day, 'recovery'));
    expect(kinds(small)).not.toContain('shrine');
  });

  it('cesty: vylepšení v Růstu i Obnově, ne v Nouzi; v okně roku a při dost velkém provozu', () => {
    const roads: Road[] = (grown.roads?.roads ?? []).filter((r) => r.grade === 'trodden');
    expect(roads.length).toBeGreaterThan(0);
    const s = structuredClone(grown);
    for (const r of s.roads!.roads) r.traffic = [200];
    const growth = structuredClone(s);
    roadStep(growth, ctxOf(at(11)));
    const emergency = structuredClone(s);
    extraSteps(emergency, ctxOf(at(11), 'emergency'));
    expect(kinds(emergency)).not.toContain('road');
    const recovery = structuredClone(s);
    roadStep(recovery, ctxOf(at(11), 'recovery'));
    expect(kinds(recovery)).toContain('road');
    const spring = structuredClone(s);
    roadStep(spring, ctxOf(at(4)));
    expect(kinds(spring)).not.toContain('road');
    const quiet = structuredClone(s);
    for (const r of quiet.roads!.roads) r.traffic = [0];
    roadStep(quiet, ctxOf(at(11)));
    expect(kinds(quiet)).not.toContain('road');
    expect(kinds(growth).filter((k) => k === 'road')).toHaveLength(1);
    const road = growth.constructions.find((c) => c.kind === 'road')!;
    expect(growth.steward?.built).toContain(road.id);
  });

  it('sad: v okně výsadby; v Obnově jen s polovinou rozpočtu volnou (nižší přednost), v Nouzi ne', () => {
    const base = structuredClone(grown);
    base.orchards = [];
    const cost = BUILD_COSTS.orchard.laborManDays * cellHa(landscape);
    const run = (month: number, mode: StewardMode, left: number): string[] => {
      const s = withLeft(base, left);
      orchardStep(s, ctxOf(at(month), mode));
      return kinds(s);
    };
    expect(run(10, 'growth', 1.2 * cost)).toContain('orchard');
    expect(run(10, 'recovery', 1.2 * cost)).not.toContain('orchard');
    expect(run(10, 'recovery', 10_000)).toContain('orchard');
    expect(run(10, 'emergency', 10_000)).not.toContain('orchard');
    expect(run(6, 'growth', 10_000)).not.toContain('orchard');
    const s = withLeft(base, 10_000);
    orchardStep(s, ctxOf(at(10)));
    const orchard = s.constructions.find((c) => c.kind === 'orchard')!;
    expect(s.steward?.built).toContain(orchard.id);
    // v Obnově jen první zdroj ovoce – ves se sadem další čtverec až v Růstu
    const second = withLeft(s, 10_000);
    second.constructions = second.constructions.filter((c) => c.kind !== 'orchard');
    expect(second.orchards ?? []).not.toHaveLength(0);
    const recovery = structuredClone(second);
    orchardStep(recovery, ctxOf(at(10), 'recovery'));
    expect(kinds(recovery)).not.toContain('orchard');
    orchardStep(second, ctxOf(at(10)));
    expect(kinds(second)).toContain('orchard');
  });

  it('rozestavěnou stavbu hráče správce započte – vedle ní druhou stejného druhu nezačne (D21)', () => {
    const month = { threshing: 4, orchard: 10, idol: 10 } as const;
    const steps = {
      threshing: ['threshing-floor', threshingStep],
      orchard: ['orchard', orchardStep],
      idol: ['idol', sacredStep],
    } as const;
    for (const name of ['threshing', 'orchard', 'idol'] as const) {
      const [kind, step] = steps[name];
      const base = withLeft(grown, 10_000);
      if (name === 'threshing') base.threshingFloors = [];
      if (name === 'threshing') {
        base.constructions = base.constructions.filter((c) => c.kind !== kind);
      }
      if (name === 'orchard') base.orchards = [];
      const ctx = ctxOf(at(month[name]));
      step(base, ctx);
      const count = (x: VillageState): number =>
        x.constructions.filter((c) => c.kind === kind).length;
      // předpoklad: správce by stavěl
      expect(count(base)).toBe(1);
      // stavba je hráčova (správce ji nezaložil) a stojí dál
      const player = structuredClone(base);
      player.steward!.built = [];
      const later = ctxOf(ctx.day + STEWARD.everyDays);
      step(player, later);
      expect(count(player)).toBe(1);
      expect(player.steward!.built).toEqual([]);
    }
  });

  it('jabloně u cest: podél upravené cesty kolem polí, když sad nestačí; ne po vyšlapané', () => {
    const base = withLeft(grown, 10_000);
    base.orchards = [];
    const trodden = structuredClone(base);
    roadApplesStep(trodden, ctxOf(at(10)));
    expect(kinds(trodden)).not.toContain('road-apples');
    for (const r of base.roads!.roads) r.grade = 'improved';
    roadApplesStep(base, ctxOf(at(10)));
    expect(kinds(base)).toContain('road-apples');
    const spring = withLeft(grown, 10_000);
    for (const r of spring.roads!.roads) r.grade = 'improved';
    roadApplesStep(spring, ctxOf(at(6)));
    expect(kinds(spring)).not.toContain('road-apples');
  });

  it('jabloně u cest jen do cíle ovoce – ve vsi bez přebytku bílkovin 5 % energie (D115 kolo 1)', () => {
    const day = at(10);
    const base = withLeft(grown, 10_000);
    base.orchards = [];
    for (const r of base.roads!.roads) r.grade = 'improved';
    // cíl ovoce podle jídla – jablka do 5 % energie, nad to jen místo obilí, které ves
    // k bílkovinám nepotřebuje (Martin 22. 11. 2026); ves bez přebytku bílkovin má cíl 5 % energie
    // za dny do zkažení – méně než 5 % energie za celý rok
    const target = fruitTargetKg(base, day, NO_CRAFTS.pottery);
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan((yearlyFoodNeed(base, day) * DIET.fruitShare) / APPLE_FOOD_VALUE);
    const squareKg = (ORCHARD.fullYieldKgPerHa * 225) / 10_000;
    /** Ves se sadem, který plnou úrodou dá aspoň `kg` jablek. */
    const withOrchardOf = (kg: number): typeof base => {
      const cells = Array.from({ length: Math.ceil(kg / squareKg) }, (_, i) => ({
        cell: { x: i, y: 0 },
        areaM2: 225,
        distanceM: 80,
        obstacleCost: 0,
      }));
      const s = foundOrchard(base, base.lastDay, { squares: cells });
      s.constructions = s.constructions.filter((c) => c.kind !== 'orchard');
      return s;
    };
    const orchardKg = (s: typeof base): number =>
      villageOrchards(s).reduce(
        (sum, o) => sum + (orchardAreaM2(o) / 10_000) * ORCHARD.fullYieldKgPerHa,
        0,
      );
    // sad pod cílem – správce začne jabloně u cest
    const short = withOrchardOf(0.5 * target);
    expect(orchardKg(short)).toBeLessThan(target);
    roadApplesStep(short, ctxOf(day));
    expect(kinds(short)).toContain('road-apples');
    // sad nad cíl – jablka by ves nesnědla, jabloně nesází
    const covered = withOrchardOf(1.5 * target);
    expect(orchardKg(covered)).toBeGreaterThan(target);
    roadApplesStep(covered, ctxOf(day));
    expect(kinds(covered)).not.toContain('road-apples');
  });

  it('sad až po jabloních u cest – jen když u pevných cest kolem polí není místo (D115)', () => {
    const day = at(10);
    const base = withLeft(grown, 10_000);
    base.orchards = [];
    for (const r of base.roads!.roads) r.grade = 'improved';
    // místo u cest je – den správce začne jabloně, sad ne
    const both = structuredClone(base);
    extraSteps(both, ctxOf(day));
    expect(kinds(both)).toContain('road-apples');
    expect(kinds(both)).not.toContain('orchard');
    const orchardOnly = structuredClone(base);
    orchardStep(orchardOnly, ctxOf(day));
    expect(kinds(orchardOnly)).not.toContain('orchard');
    // u žádné cesty místo není (správce je prošel a odložil) – sad na zbytek cíle
    const full = structuredClone(base);
    full.steward!.skips = full.roads!.roads.map((r) => ({
      kind: 'road-apples',
      id: r.id,
      untilDay: day + STEWARD.retryDays,
    }));
    orchardStep(full, ctxOf(day));
    expect(kinds(full)).toContain('orchard');
  });

  it('ohrada koní: cvičící rodina, v Růstu i Obnově; bez výcviku ne', () => {
    const base = withLeft(grown, 10_000);
    base.livestock = {
      ...(base.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    } as NonNullable<VillageState['livestock']>;
    base.storesKg = 50_000;
    const horse = (s: VillageState): boolean => penStarted(s, 'horse');
    const idle = structuredClone(base);
    penStep(idle, ctxOf(at(10)));
    expect(horse(idle)).toBe(false);
    base.lord = { ...(base.lord ?? {}), trains: true } as NonNullable<VillageState['lord']>;
    for (const mode of ['growth', 'recovery'] as const) {
      const s = structuredClone(base);
      penStep(s, ctxOf(at(10), mode));
      expect(horse(s)).toBe(true);
    }
    const emergency = structuredClone(base);
    extraSteps(emergency, ctxOf(at(10), 'emergency'));
    expect(horse(emergency)).toBe(false);
  });

  it('spřežení: ohrada volů s ohradou skotu a chovným párem krav – i bez výrostků', () => {
    const base = withLeft(grown, 10_000);
    const herds = (cow: number): NonNullable<VillageState['livestock']> =>
      ({
        ...(base.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
        herds: { sheep: 0, goat: 0, pig: 0, cow },
      }) as NonNullable<VillageState['livestock']>;
    // ohrada skotu stojí (postaví ji správce pro plné stádo a dostaví se)
    base.pens = (base.pens ?? []).filter((p) => p.builtDay !== null);
    base.constructions = base.constructions.filter((c) => c.kind !== 'pen');
    base.livestock = herds(4);
    if (!base.pens.some((p) => p.species === 'cattle')) penStep(base, ctxOf(at(3)));
    const cattle = base.pens.find((p) => p.species === 'cattle')!;
    expect(cattle).toBeDefined();
    cattle.builtDay ??= base.lastDay;
    base.constructions = base.constructions.filter((c) => c.kind !== 'pen');
    base.pens = [cattle];
    // chovný pár krav (po zimní porážce 1,96 – zaokrouhleně pár) – s ohradou volů ves drží krávy na
    // voly a stádo doroste (steward.md – Ohrada volů podle stáda a osevu)
    base.livestock = herds(1.96);
    const day = at(10);
    // výrostek 7–13 let, který stádo pase
    const herder = base.people[0]!;
    const noHerders = structuredClone(base);
    noHerders.people = noHerders.people.filter(
      (p) => youngsterHerders({ ...noHerders, people: [p] }, day) <= 0,
    );
    base.people = [
      ...noHerders.people,
      { ...herder, id: 99_001, bornDay: day - Math.round(10 * 365.25) },
    ];
    expect(youngsterHerders(base, day)).toBeGreaterThan(0);
    const team = (s: VillageState): boolean => penStarted(s, 'team');
    const ctx = (s: VillageState): StewardContext => ({
      ...ctxOf(day),
      outlook: stewardOutlook(s, day, NO_CRAFTS),
    });
    const s = structuredClone(base);
    penStep(s, ctx(s));
    expect(team(s)).toBe(true);
    // bez výrostků pase dospělý (diet.md – Pasáci, Dospělý pasák; Martin 2. 11. 2026) – ohrada
    // volů i tak
    const alone = structuredClone(base);
    alone.people = noHerders.people;
    penStep(alone, ctx(alone));
    expect(team(alone)).toBe(true);
    const fewCows = structuredClone(base);
    fewCows.livestock!.herds.cow = 1;
    penStep(fewCows, ctx(fewCows));
    expect(team(fewCows)).toBe(false);
    // bez osevu výhledu (výhled bez půdy) orba nic neušetří
    const noSowing = structuredClone(base);
    penStep(noSowing, ctxOf(day));
    expect(team(noSowing)).toBe(false);
  });

  it('vozová cesta: jen s vozem a s celou cenou v rozpočtu práce', () => {
    const base = withLeft(grown, 10_000);
    const day = at(11);
    for (const r of base.roads!.roads) r.grade = 'improved';
    // jediný úsek s provozem – ten, po kterém vozová cesta jde (krátké a blokované ne)
    const road = base.roads!.roads.find(
      (r) => planWagonRoad(wagonPlanInputOf(base, day, r.id, landscape, obstacles)).ok,
    )!;
    expect(road).toBeDefined();
    for (const r of base.roads!.roads) r.traffic = [r.id === road.id ? 5 : 0];
    const wagon = (s: VillageState): boolean => (s.roads?.earthworks ?? []).length > 0;
    const noCart = structuredClone(base);
    roadStep(noCart, ctxOf(day));
    expect(kinds(noCart)).not.toContain('road');
    base.carts = [{ id: 99_000, kind: 'two-wheel', builtDay: base.lastDay }];
    const s = structuredClone(base);
    roadStep(s, ctxOf(day));
    expect(kinds(s)).toContain('road');
    expect(wagon(s)).toBe(true);
    const tight = withLeft(base, 1);
    roadStep(tight, ctxOf(day));
    expect(kinds(tight)).not.toContain('road');
  });

  it('zemská stezka až od trailPeople lidí', () => {
    const s = structuredClone(grown);
    roadStep(s, ctxOf(at(11)));
    expect(s.trails ?? []).toHaveLength(0);
  });

  it('rok 0 s hrdlem práce: humno jen když práce výmlatu pokryje cenu, ohrady ne', () => {
    const base = structuredClone(grown);
    base.threshingFloors = [];
    base.constructions = base.constructions.filter((c) => c.kind !== 'threshing-floor');
    base.pens = [];
    base.livestock = {
      ...(base.livestock ?? ({} as NonNullable<VillageState['livestock']>)),
      herds: { sheep: 0, goat: 0, pig: 0, cow: 4 },
    } as NonNullable<VillageState['livestock']>;
    const labor: StewardOutlook = { ...OPEN_OUTLOOK, bottleneck: 'labor', lasting: 'labor' };
    const day = at(3);
    const first = (outlook: StewardOutlook): VillageState => {
      const s = structuredClone(base);
      s.foundedDay = day - 100;
      threshingStep(s, { ...ctxOf(day), outlook });
      penStep(s, { ...ctxOf(day), outlook });
      return s;
    };
    const bound = first(labor);
    expect(penStarted(bound, 'cattle')).toBe(false);
    const threshLabor = (s: VillageState): number =>
      fieldCapacity(s, day, NO_CRAFTS.pottery)!.sownHa *
      fieldWorkPerHa('thresh', NO_CRAFTS.tools) *
      THRESHING.emergencyWork;
    const floorCost = BUILD_COSTS['threshing-floor'].laborManDays;
    expect(kinds(bound).includes('threshing-floor')).toBe(threshLabor(base) >= floorCost);
    const small = structuredClone(base);
    small.parts = small.parts.slice(0, 1);
    expect(threshLabor(small)).toBeLessThan(floorCost);
    small.foundedDay = day - 100;
    threshingStep(small, { ...ctxOf(day), outlook: labor });
    expect(kinds(small)).not.toContain('threshing-floor');
    const land = first(OPEN_OUTLOOK);
    expect(kinds(land)).toContain('threshing-floor');
    expect(penStarted(land, 'cattle')).toBe(true);
    // starší ves s hrdlem práce staví jako dřív
    const older = structuredClone(base);
    threshingStep(older, { ...ctxOf(day), outlook: labor });
    penStep(older, { ...ctxOf(day), outlook: labor });
    expect(kinds(older)).toContain('threshing-floor');
    expect(penStarted(older, 'cattle')).toBe(true);
  });

  it('cesty: horizont návratnosti podle režimu – střední provoz v Růstu ano, v Obnově ne', () => {
    const s = structuredClone(grown);
    // ≈ 6 pochůzek denně: vrátí se za ≈ 16 let (Růst 25, Obnova 5)
    for (const r of s.roads!.roads) r.traffic = [6];
    const growth = structuredClone(s);
    roadStep(growth, ctxOf(at(11)));
    expect(kinds(growth)).toContain('road');
    const recovery = structuredClone(s);
    roadStep(recovery, ctxOf(at(11), 'recovery'));
    expect(kinds(recovery)).not.toContain('road');
    const rare = structuredClone(s);
    for (const r of rare.roads!.roads) r.traffic = [2];
    roadStep(rare, ctxOf(at(11)));
    expect(kinds(rare)).not.toContain('road');
  });

  it('pojistka: bufferFill mimo Nouzi (hlídá spuštění testu)', () => {
    expect(bufferFill(fieldStoresOutlook(grown, grown.lastDay, NO_CRAFTS))).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe('steward-extras – úspora vylepšení cesty (roadUpgradeSavedPerYear)', () => {
  const road = (extra: Partial<Road> = {}): Road => ({
    id: 1,
    points: [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    ],
    bornDay: 0,
    grade: 'trodden',
    traffic: [10],
    spots: [],
    ...extra,
  });

  it('100 m při 10 pochůzkách denně ušetří ≈ 1,6 čd za rok – vrátí se za ≈ 9,4 roku', () => {
    const r = road();
    const saved = roadUpgradeSavedPerYear(r);
    expect(saved).toBeCloseTo((10 * 365 * 2 * 100 * (1 / 1.5 - 1 / 1.7)) / 36_000, 6);
    expect(roadUpgradeCost(r).manDays / saved).toBeCloseTo(9.4, 1);
    expect(roadUpgradeSavedPerYear(road({ traffic: [0] }))).toBe(0);
  });

  it('mokřina s hatí a jízdy vozem úsporu zvětší', () => {
    const dry = roadUpgradeSavedPerYear(road());
    const wet = roadUpgradeSavedPerYear(road({ ground: { wet: [[20, 70]], fords: [] } }));
    expect(wet).toBeGreaterThan(dry * 5);
    const carts = roadUpgradeSavedPerYear(road({ cartTraffic: [2] }));
    expect(carts).toBeGreaterThan(dry);
    const worn = roadUpgradeSavedPerYear(road({ cartTraffic: [2], cart: true }));
    expect(worn).toBeGreaterThan(dry);
    expect(worn).toBeLessThan(carts);
  });

  it('horizont: v Růstu se vrátí od ≈ 3,8 pochůzky denně, v Obnově od ≈ 19, v Nouzi nikdy', () => {
    const pays = (trips: number, mode: StewardMode): boolean => {
      const r = road({ traffic: [trips] });
      return (
        roadUpgradeSavedPerYear(r) * STEWARD.roadPaybackYears[mode] > roadUpgradeCost(r).manDays
      );
    };
    expect(pays(4, 'growth')).toBe(true);
    expect(pays(3.5, 'growth')).toBe(false);
    expect(pays(20, 'recovery')).toBe(true);
    expect(pays(18, 'recovery')).toBe(false);
    expect(pays(1000, 'emergency')).toBe(false);
  });
});

describe('steward-extras – zdravá ves (seed krajiny 2): režim a okna roku se potkají', () => {
  // ves zakladatelů na krajině 2 nehladoví (kouřový test S5) – každý krok musí mít dny, kdy jeho
  // režim i okno roku platí, a sad má vzniknout do ≈ 10 let (oprava 31. 10. 2026: Růst nastával
  // hlavně v srpnu, mimo okna výsadby i cest)
  const healthy = generateLandscape(2, CURRENT_LAYER_VERSIONS);
  const healthyObstacles = obstaclesOf(healthy);
  const windows: Record<string, (date: ReturnType<typeof dateOfDayIndex>) => boolean> = {
    cemetery: () => true,
    threshing: (d) => inStewardWindows(d, STEWARD.threshingWindows),
    pen: (d) => inStewardWindows(d, STEWARD.offHarvestWindows),
    horses: (d) => inStewardWindows(d, STEWARD.offHarvestWindows),
    orchard: (d) => monthInWindow(ORCHARD_PLANTING_WINDOWS, d.month),
    roadApples: (d) => monthInWindow(ORCHARD_PLANTING_WINDOWS, d.month),
    sacred: (d) => inStewardWindows(d, STEWARD.offHarvestWindows),
    road: (d) => inStewardWindows(d, STEWARD.roadWindows),
  };
  const open = new Map<string, number>();
  let orchardYear = Number.POSITIVE_INFINITY;

  beforeAll(() => {
    const site = healthy.villageSite;
    const c = tileCenterWorld(healthy, site.x, site.y);
    const founded = foundVillage({
      seed: 4242,
      day: SEPT,
      dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
    });
    let s: VillageState = { ...founded, steward: newSteward(SEPT, true) };
    for (let day = SEPT + STEWARD.everyDays; day <= SEPT + HEALTHY_YEARS * YEAR;) {
      s = advanceVillage(s, day, healthyObstacles, healthy);
      const mode = stewardMode(s, day, craftCoverage(s, day));
      const date = dateOfDayIndex(day);
      for (const [step, inWindow] of Object.entries(windows)) {
        if ((STEWARD.stepModes[step]?.[mode] ?? 0) > 0 && inWindow(date)) {
          open.set(step, (open.get(step) ?? 0) + 1);
        }
      }
      const built = new Set(s.steward?.built ?? []);
      const orchard =
        (s.orchards ?? []).some((o) => built.has(o.id)) ||
        s.constructions.some((k) => k.kind === 'orchard' && built.has(k.id));
      if (orchard) orchardYear = Math.min(orchardYear, (day - SEPT) / YEAR);
      day += STEWARD.everyDays;
    }
  }, 300_000);

  it('každý krok má dny, kdy platí jeho režim i okno roku', () => {
    for (const step of Object.keys(windows)) expect(open.get(step) ?? 0, step).toBeGreaterThan(0);
  });

  it('sad správce do ≈ 10 let', () => {
    expect(orchardYear).toBeLessThanOrEqual(10);
  });
});
