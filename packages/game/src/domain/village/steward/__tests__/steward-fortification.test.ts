import { beforeAll, describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
  tileOfWorldPoint,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import {
  fortificationOutline,
  fortOutlineOf,
  hullOffsetPoints,
  villageThreat,
} from '../../fortification';
import { fortOccupancy } from '../../fortification/assault';
import { fortificationCore } from '../../fortification/state/fortification-proposal';
import { pointInPolygon } from '../../placement/polygon';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import { startFortification } from '../../fortification/state/fortifications';
import { applyInboxDay } from '../../core/inbox';
import { NO_CRAFTS } from '../../core/productivity';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { fortificationStep, extraSteps } from '../steward-extras';
import {
  fortDefenders,
  fortHorizonYears,
  fortPlanOf,
  fortValue,
  NO_FORT,
  planProtection,
  refugeNeedM2,
  stewardFortificationFor,
  stewardKgPerManDay,
  type FortPlan,
} from '../steward-fortification';
import { planSettlement } from '../steward-plan';
import { newSteward } from '../steward-state';
import type { StewardContext, StewardMode } from '../steward';
import type { StewardOutlook } from '../steward-outlook';
import type { Person, ThreatSignal, VillageState, WallKind } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Krok Opevnění správce (fortifications.md – Hradby a obrana, Správce; Hrozba; steward.md –
// Rozhodovací pořadí). Od 8. 11. 2026 ochrana druhu místo násobku (plán hradeb, Úloha 15).

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

const OPEN_OUTLOOK: StewardOutlook = {
  laborHa: Infinity,
  workableHa: Infinity,
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

function dayOn(year: number, month: number, d: number): number {
  return Math.ceil(dayIndexOf({ year, month, day: d }) / STEWARD.everyDays) * STEWARD.everyDays;
}

const forts = (s: VillageState): string[] =>
  s.constructions.filter((c) => c.kind === 'fortification').map((c) => c.fortWork ?? '');

describe('steward-fortification – opevnění podle hrozby', () => {
  let grown: VillageState;
  let day: number;
  beforeAll(() => {
    const site = landscape.villageSite;
    const c = tileCenterWorld(landscape, site.x, site.y);
    const start = {
      ...foundVillage({ seed: 4242, day: SEPT, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } }),
      steward: newSteward(SEPT, true),
    };
    let s = advanceVillage(
      planSettlementDone(withBuiltFirstDwelling(start)),
      SEPT + 3 * YEAR,
      obstacles,
      landscape,
    );
    s = planSettlementDone(s);
    s.woodLogs = 5000;
    grown = s;
    day = Math.max(grown.lastDay + 1, dayOn(dateOfDayIndex(grown.lastDay).year + 1, 10, 5));
  }, 120_000);

  function planSettlementDone(state: VillageState): VillageState {
    let s = state;
    for (let k = 0; k < 12 && s.steward?.plan?.stage !== 'done'; k++) {
      s = planSettlement(s, s.lastDay, landscape, obstacles);
    }
    s.commonLaborHistory = Array.from({ length: 30 }, () => 60);
    return s;
  }

  /**
   * Ves s hrozbou nájezdu a stádem 50 krav navíc (do 10. 11. 2026 30 – přílohová soustava dává
   * z čtverce 3 osevy, kg na člověkoden je vyšší a ztráta v člověkodnech menší) – ztráta nájezdu
   * ≈ 12 000 čd, aby se palisáda
   * vyplatila i se 2 obránci na ≈ 200–270 m (malé vsi bez dobytka se opevnění nevyplatí – Martinovy
   * cíle 8. 11. 2026; ochrana jen s obránci od 9. 11. 2026 – se 12 kravami jako dřív už ne).
   */
  const rich = (s: VillageState): VillageState => {
    const herds = s.livestock!.herds;
    s.livestock = { ...s.livestock!, herds: { ...herds, cow: herds.cow + 50 } };
    return s;
  };

  const threatened = (kind: ThreatSignal['kind'] = 'raid-here'): VillageState => {
    const s = rich(structuredClone(grown));
    s.threats = [{ kind, day }];
    return s;
  };

  it('hrozba 0: správce neopevní, ani když zbývá práce', () => {
    const s = structuredClone(grown);
    extraSteps(s, ctxOf(day));
    expect(forts(s)).toHaveLength(0);
    s.threats = [{ kind: 'raid-here', day: 0 }];
    // signál starší než 50 let se nepočítá
    extraSteps(s, ctxOf(day + 60 * YEAR));
    expect(forts(s)).toHaveLength(0);
  });

  it('po signálu „nájezd na tuto ves“ v Růstu i v Obnově postaví opevnění; v Nouzi ne', () => {
    const growth = threatened();
    fortificationStep(growth, ctxOf(day));
    expect(forts(growth)).toEqual(['build']);
    const c = growth.constructions.find((x) => x.kind === 'fortification')!;
    // stavba i opevnění jsou správcovy
    expect(growth.steward!.built).toContain(c.id);
    expect(growth.steward!.built).toContain(c.fortificationId);
    expect(growth.fortifications).toHaveLength(1);
    const recovery = threatened();
    extraSteps(recovery, ctxOf(day, 'recovery'));
    expect(forts(recovery).length).toBeGreaterThanOrEqual(0);
    const emergency = threatened();
    extraSteps(emergency, ctxOf(day, 'emergency'));
    expect(forts(emergency)).toHaveLength(0);
  });

  it('nestaví v žních (červenec, srpen)', () => {
    const s = threatened();
    fortificationStep(s, ctxOf(dayOn(dateOfDayIndex(day).year, 8, 5)));
    expect(forts(s)).toHaveLength(0);
  });

  it('nejlepší druh má kladnou hodnotu přínos × horizont − cena; slabší hrozba druh zmenší', () => {
    const s = threatened();
    const kg = stewardKgPerManDay(s, landscape, obstacles);
    const length = stewardFortificationFor(s, landscape, obstacles, day, 'palisade')!.lengthM;
    const men = fortDefenders(s, day);
    const input = { lengthM: length, kgPerManDay: kg, years: 20, men, from: null };
    const plan = (wall: WallKind): FortPlan => ({ ...NO_FORT, wall });
    const fence = fortValue(s, day, plan('fence'), 1, input);
    const palisade = fortValue(s, day, plan('palisade'), 1, input);
    expect(palisade.gain * 20 - palisade.cost).toBeGreaterThan(0);
    // palisáda chrání víc (0,4 proti 0,04 × obsazenost) a stojí víc
    expect(palisade.gain).toBeGreaterThan(fence.gain);
    expect(palisade.cost).toBeGreaterThan(fence.cost);
    // plot vyjde hůř než palisáda – správce ho nepostaví (Martin 8. 11. 2026: plot se nevyplatí;
    // na typických vsích je záporný – Martinovy cíle níž)
    expect(fence.gain * 15 - fence.cost).toBeLessThan(palisade.gain * 20 - palisade.cost);
    // hrozba 0,001: přínos nepokryje cenu
    const weak = fortValue(s, day, plan('palisade'), 0.001, input);
    expect(weak.gain * 20 - weak.cost).toBeLessThan(0);
    // vylepšení plotu na palisádu počítá jen rozdíl ochrany
    const up = fortValue(s, day, plan('palisade'), 1, { ...input, from: plan('fence') });
    expect(up.gain).toBeCloseTo(palisade.gain - fence.gain, 9);
  });

  it('obvod obsahuje obydlí, humna a ohrady, pole ne', () => {
    const s = structuredClone(grown);
    expect(stewardFortificationFor(s, landscape, obstacles, day, 'fence')).not.toBeNull();
    const inside = (line: readonly (readonly [number, number])[], x: number, z: number): boolean =>
      pointInPolygon([x, z], line);
    const ring = (state: VillageState): (readonly [number, number])[] =>
      fortificationOutline(hullOffsetPoints(fortificationCore(state, landscape), 4), 'fence')!
        .polyline;
    for (const d of s.dwellings) expect(inside(ring(s), d.position.x, d.position.z)).toBe(true);
    // ohrada a humno daleko od vsi vstoupí do obvodu, pole ne
    const home = s.dwellings[0]!.position;
    const far = { x: home.x + 60, z: home.z };
    const t = tileOfWorldPoint(landscape, far.x, far.z)!;
    s.pens = [{ id: 7001, cell: t, x: far.x, z: far.z, builtDay: 0, species: 'cattle' }];
    s.threshingFloors = [
      { id: 7002, position: { ...home, x: home.x - 50, rotation: 0 }, builtDay: 0 },
    ];
    const wider = ring(s);
    expect(inside(wider, far.x, far.z)).toBe(true);
    expect(inside(wider, home.x - 50, home.z)).toBe(true);
    // pole daleko od staveb do obvodu nepatří
    const half = (landscape.size * landscape.cellSizeM) / 2;
    expect(inside(wider, half - 5, half - 5)).toBe(false);
  });

  it('útočiště pojme lidi a dobytek + 20 %', () => {
    const s = withThreat(grown);
    const offset = FORTIFICATIONS.bandM.fence + FORTIFICATIONS.proposal.clearanceM;
    const bare = fortificationOutline(
      hullOffsetPoints(fortificationCore(s, landscape), offset),
      'fence',
    )!;
    const cows = Math.ceil(bare.innerAreaM2 / 20);
    s.livestock = {
      herds: { cow: cows, pig: 20, sheep: 40, goat: 0 },
      young: { cow: 0, pig: 0, sheep: 0, goat: 0 },
    };
    let beasts = 0;
    for (const p of s.pens ?? []) beasts += (p.oxen?.length ?? 0) + (p.horses?.length ?? 0);
    beasts += (s.looseOxen?.length ?? 0) + (s.looseHorses?.length ?? 0);
    const need = (s.people.length * 10 + (cows + 0.25 * 60 + beasts) * 20) * 1.2;
    expect(refugeNeedM2(s)).toBeCloseTo(need, 6);
    // holý obvod útočiště nepojme, správce odstup po 5 m zvětší
    expect(bare.innerAreaM2).toBeLessThan(need);
    fortificationStep(s, ctxOf(day));
    const fort = s.fortifications?.[0];
    expect(fort).toBeDefined();
    expect(fort!.points).toBeDefined();
    expect(fortOutlineOf(landscape, fort!)!.innerAreaM2).toBeGreaterThanOrEqual(need);
  });

  function withThreat(s: VillageState): VillageState {
    const c = structuredClone(s);
    c.threats = [{ kind: 'raid-here', day }];
    return c;
  }

  it('hráčovo opevnění správce nemění a vedle něj nestaví', () => {
    const s = threatened();
    const points = stewardFortificationFor(s, landscape, obstacles, day, 'fence')!.points;
    const r = startFortification(s, s.lastDay, landscape, obstacles, { points, kind: 'fence' });
    if (!r.ok) throw new Error(r.reason);
    const player = r.state;
    // dostavěné hráčovo opevnění
    for (const f of player.fortifications!) for (const seg of f.segments) seg.builtDay = 0;
    player.constructions = player.constructions.filter((c) => c.kind !== 'fortification');
    const before = JSON.stringify(player.fortifications);
    fortificationStep(player, ctxOf(day));
    expect(forts(player)).toHaveLength(0);
    expect(JSON.stringify(player.fortifications)).toBe(before);
  });

  it('vlastní plot správce se vylepší na palisádu jen s přínosem rozdílu ochrany', () => {
    const s = threatened();
    fortificationStep(s, ctxOf(day));
    const fort = s.fortifications![0]!;
    // dostavěný plot (druh vynutíme – krok si vybírá podle hodnoty)
    fort.kind = 'fence';
    for (const seg of fort.segments) seg.builtDay = 0;
    s.constructions = s.constructions.filter((c) => c.kind !== 'fortification');
    fortificationStep(s, ctxOf(day + STEWARD.everyDays));
    // palisáda proti plotu: přínos roste s hrozbou, vylepšení je stavba téhož opevnění
    expect(s.fortifications).toHaveLength(1);
    const upgrade = s.constructions.find((c) => c.kind === 'fortification');
    expect(upgrade?.fortWork).toBe('upgrade');
    expect(upgrade?.fortTarget).toBe('palisade');
    expect(upgrade?.fortificationId).toBe(fort.id);
  });

  it('k vlastní palisádě s ochozem doplní val s příkopem, když se vyplatí (velká ztráta nájezdu)', () => {
    const s = threatened();
    // přílohová soustava (10. 11. 2026): 3 osevy z čtverce – kg na člověkoden vyšší, ztráta
    // nájezdu v člověkodnech menší; val se vyplatí s větším stádem (dřív +40)
    s.livestock!.herds.cow += 160;
    // val vně palisády by s větším útočištěm křížil modlu – test měří rozhodnutí, ne polohu
    // posvátných míst (jako „po kouscích“)
    delete s.sacredBuildings;
    fortificationStep(s, ctxOf(day));
    const fort = s.fortifications![0]!;
    // dostavěná palisáda s ochozem bez valu (druh vynutíme) – před rokem 790 jí zbývá jen val;
    // holé palisádě vyjde podle ztráty líp ochoz nebo ochoz s valem (obojí + 0,1 × obsazenost)
    fort.kind = 'walkway';
    delete fort.top;
    for (const seg of fort.segments) {
      seg.builtDay = 0;
      delete seg.kind;
      delete seg.top;
      delete seg.topBuiltDay;
    }
    s.constructions = s.constructions.filter((c) => c.kind !== 'fortification');
    expect(fortPlanOf(fort)).toEqual({ wall: 'walkway', rampart: false, water: false });
    fortificationStep(s, ctxOf(day + STEWARD.everyDays));
    const c = s.constructions.find((x) => x.kind === 'fortification');
    expect(c?.fortWork).toBe('rampart');
    expect(c?.fortificationId).toBe(fort.id);
    expect(s.steward!.built).toContain(c!.id);
  });

  it('schránka: threat-signal se zapíše, zdvojí se jen jednou a válka dostane konec', () => {
    const s = structuredClone(grown);
    const ev = (signal: ThreatSignal, seq: number) => ({
      id: `e${seq}`,
      villageId: 'v',
      day: day,
      seq,
      body: { kind: 'threat-signal' as const, signal },
    });
    applyInboxDay(s, day, [
      ev({ kind: 'raid-here', day }, 1),
      ev({ kind: 'raid-here', day }, 2),
      ev({ kind: 'war', day }, 3),
      ev({ kind: 'war', day, endDay: day + 100 }, 4),
    ]);
    expect(s.threats).toEqual([
      { kind: 'raid-here', day },
      { kind: 'war', day, endDay: day + 100 },
    ]);
    expect(villageThreat(s.threats, day)).toBe(1);
  });

  it('po kouscích (1, 3, 10 dní) stejně jako vcelku', { timeout: 120_000 }, () => {
    // stádo navíc až po dopočtu – ves by přebytek dobytka nad místo v ohradách prodala
    const start = rich(advanceVillage(structuredClone(grown), day - 1, obstacles, landscape));
    // modla a svatyně, které ves za další rok postaví, leží podle rozvrhu vsi – s ohradami u domů
    // (přednost ohrad a sadu v plánu, 9. 11. 2026) je obvod kolem jádra křížil; test měří opevnění
    // a dopočet po kouscích, ne polohu posvátných míst (jako steward-extras)
    delete start.sacredBuildings;
    start.constructions = start.constructions.filter(
      (c) => c.kind !== 'idol' && c.kind !== 'shrine',
    );
    start.threats = [{ kind: 'raid-here', day: start.lastDay }];
    // rozpočet práce nebrání (jinak by stavbu zablokovaly rozdělané stavby)
    start.commonLaborHistory = Array.from({ length: 30 }, () => 5000);
    // ani hlad – ves stavějící jen prací mužů (population.md – Práce, Stavby staví muži) má za tři
    // roky méně polí a správce by v nouzi opevnění nezačal; test měří dopočet po kouscích
    start.storesKg += 20_000;
    start.starvationDays = 0;
    const to = start.lastDay + 10;
    const whole = advanceVillage(start, to, obstacles, landscape);
    const step = (n: number): VillageState => {
      let s = start;
      while (s.lastDay < to)
        s = advanceVillage(s, Math.min(to, s.lastDay + n), obstacles, landscape);
      return s;
    };
    expect(forts(whole)).toEqual(['build']);
    expect(JSON.stringify(step(1))).toBe(JSON.stringify(whole));
    expect(JSON.stringify(step(3))).toBe(JSON.stringify(whole));
  });
});

describe('ochrana druhu – Martinovy cíle (fortifications.md – Hradby a obrana, Správce)', () => {
  // Typické vsi (návrh Clauda): polovina dospělých (30 let), polovina dětí (5 let), muži půlka
  // lidí; dobytek kráva na 6 lidí a 2 ovce na krávu, zásoby nad kořistí 20 mužů, bez klád a kamene
  // na hromadě, 2 kg obilí na člověkoden. Obvod správce kolem celého jádra vsi (obydlí s pozemky,
  // ohrady, humna) – 60 lidí 600 m, 150 lidí 900 m. Hrozba 1, Růst (horizont 25 let).
  const DAY = dayOn(520, 10, 5);
  const kg = 2;

  function village(people: number, cows: number, lengthM: number) {
    const base = foundVillage({ seed: 7, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    const template = base.people[0]!;
    const list: Person[] = Array.from({ length: people }, (_, i) => ({
      ...template,
      id: 1000 + i,
      sex: i % 2 === 0 ? 'male' : 'female',
      bornDay: DAY - (i < people / 2 ? 30 : 5) * YEAR,
    }));
    const state: VillageState = {
      ...base,
      people: list,
      storesKg: 2000,
      woodLogs: 0,
      livestock: {
        herds: { cow: cows, pig: 0, sheep: 2 * cows, goat: 0 },
        young: { cow: 0, pig: 0, sheep: 0, goat: 0 },
      },
    };
    const men = fortDefenders(state, DAY);
    return { state, men, lengthM };
  }

  /** Hodnota nového plánu: přínos × horizont − cena. */
  function value(v: ReturnType<typeof village>, plan: FortPlan): number {
    const years = fortHorizonYears(plan, null, 'growth');
    const { gain, cost } = fortValue(v.state, DAY, plan, 1, {
      lengthM: v.lengthM,
      kgPerManDay: kg,
      from: null,
      years,
      men: v.men,
    });
    return gain * years - cost;
  }

  const WALLS: (WallKind | null)[] = [null, 'fence', 'palisade', 'walkway', 'crib', 'chamber'];
  const plans = (): FortPlan[] =>
    WALLS.flatMap((wall) =>
      [false, true].map((rampart) => ({ wall, rampart, water: false })),
    ).filter((p) => p.wall !== null || p.rampart);

  it('obsazenost: 20 mužů na 400 m = 0,25; 100 mužů víc než 1 nedá', () => {
    expect(fortOccupancy(20, 400)).toBeCloseTo(0.25, 9);
    expect(fortOccupancy(100, 400)).toBe(1);
  });

  it('ochrana jen s obránci = (hradba + val + vodní příkop) × obsazenost, neobsazená nechrání', () => {
    expect(planProtection({ wall: 'fence', rampart: false, water: false }, 0.25)).toBeCloseTo(
      0.01,
      9,
    );
    expect(planProtection({ wall: 'walkway', rampart: false, water: false }, 0.5)).toBeCloseTo(
      0.25,
      9,
    );
    expect(planProtection({ wall: 'palisade', rampart: true, water: true }, 0)).toBe(0);
    expect(planProtection({ wall: 'palisade', rampart: true, water: true }, 0.5)).toBeCloseTo(
      0.3,
      9,
    );
    expect(planProtection({ wall: 'chamber', rampart: true, water: true }, 1)).toBeCloseTo(0.75, 9);
    expect(planProtection(NO_FORT, 1)).toBe(0);
  });

  it('ves 60 lidí (i 100 lidí na 730 m): nevyplatí se plot, palisáda, val ani hradby', () => {
    const v = village(60, 10, 600);
    expect(v.men).toBe(15);
    for (const plan of plans()) expect(value(v, plan), JSON.stringify(plan)).toBeLessThan(0);
    const mid = village(100, 17, 730);
    for (const plan of plans()) expect(value(mid, plan), JSON.stringify(plan)).toBeLessThan(0);
  });

  it('ves 150 lidí blízko stropu: vyplatí se palisáda – plot, ochoz, val i hradby vyjdou hůř', () => {
    const v = village(150, 25, 900);
    const ranked = plans()
      .map((plan) => ({ plan, value: value(v, plan) }))
      .sort((a, b) => b.value - a.value);
    const best = ranked[0]!;
    expect(best.value).toBeGreaterThan(0);
    expect(best.plan).toEqual({ wall: 'palisade', rampart: false, water: false });
    expect(value(v, { ...NO_FORT, wall: 'fence' })).toBeLessThan(0);
    // stojící palisádě se nevyplatí ani ochoz, ani val
    const palisade: FortPlan = { ...NO_FORT, wall: 'palisade' };
    for (const plan of [
      { ...palisade, wall: 'walkway' as const },
      { ...palisade, rampart: true },
    ]) {
      const years = fortHorizonYears(plan, palisade, 'growth');
      const { gain, cost } = fortValue(v.state, DAY, plan, 1, {
        lengthM: v.lengthM,
        kgPerManDay: kg,
        from: palisade,
        years,
        men: v.men,
      });
      expect(gain * years - cost, JSON.stringify(plan)).toBeLessThan(0);
    }
    for (const r of ranked) {
      if (r.plan.wall === 'crib' || r.plan.wall === 'chamber') expect(r.value).toBeLessThan(0);
    }
  });

  it('plán stojícího opevnění: nejnižší hradba dílů, val jen dostavěný všude', () => {
    const fort = {
      id: 1,
      kind: 'rampart' as const,
      top: 'palisade' as const,
      points: [],
      gates: [],
      segments: [
        { index: 0, builtDay: 1, topBuiltDay: 2 },
        { index: 1, builtDay: 1, topBuiltDay: 2, top: 'walkway' as const },
      ],
    } as unknown as Parameters<typeof fortPlanOf>[0];
    expect(fortPlanOf(fort)).toEqual({ wall: 'palisade', rampart: true, water: false });
    fort.segments[0]!.topBuiltDay = null;
    expect(fortPlanOf(fort)).toEqual({ wall: null, rampart: true, water: false });
    fort.segments[1]!.builtDay = null;
    expect(fortPlanOf(fort).rampart).toBe(false);
  });
});
