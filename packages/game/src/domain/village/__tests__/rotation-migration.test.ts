import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { withSowingRotation } from '../rotation';
import { advanceVillage } from '../simulate';
import type { FarmSeason, FieldPart, TaskName, VillageState } from '../types';
import { seasonCrops, withSeason } from '../year-plan';

// Převod starších vsí na osevní postup po dílech (fields.md – Osevní postup po dílech, bod 7 –
// Starší vsi): ves uložená s ročním plánem jde dál bez ztráty zasetého a rozdělaného.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** Ves se 120 hotovými díly po 0,25 ha (od domu ven), bez staveb, den před hospodářským rokem. */
function village(): VillageState {
  const parts: PartInput[] = Array.from({ length: 120 }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 23,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = at(600, 8, 31);
  // hladová ves, ale s osivem – osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)
  s.storesKg = 600;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Ves dopočítaná do dne – jednou pro všechny testy (dopočet je drahý). */
const BASE = village();
const STATES = new Map<number, VillageState>();
function stateAt(day: number): VillageState {
  let s = STATES.get(day);
  if (!s) {
    const from = [...STATES.entries()].filter(([d]) => d < day).sort((a, b) => b[0] - a[0])[0];
    s = advanceVillage(from?.[1] ?? BASE, day, null);
    STATES.set(day, s);
  }
  return s;
}

/** Plodina hospodářského roku ve tvaru ročního plánu (bez názvu plodiny). */
type OldWork = Omit<FarmSeason['crops'][number], 'crop'>;

/** Hospodářský rok zpět do tvaru ročního plánu z feat/landscape (jař nahoře, ozim, luštěniny, len). */
function legacyPlan(season: FarmSeason | null): unknown {
  if (!season) return null;
  expect(season.crops.some((c) => c.surplus)).toBe(false);
  // osivo plánu (fields.md – Úroda, Osivo ze zásob) je novější než roční plán – ten ho nezná
  const { startDay, crops, ...rest } = season;
  delete rest.seedWaitingKg;
  delete rest.seedFloorKg;
  delete rest.selection;
  const work = (crop: string): OldWork | undefined => {
    const found = crops.find((c) => c.crop === crop);
    if (!found) return undefined;
    const copy: Partial<FarmSeason['crops'][number]> = { ...found };
    delete copy.crop;
    return copy as OldWork;
  };
  return {
    ...rest,
    plannedDay: startDay,
    ...(work('spring') ?? { partIds: [], required: {}, done: {}, harvestedKg: null }),
    ...(work('winter') ? { winter: work('winter') } : {}),
    ...(work('legume') ? { legume: work('legume') } : {}),
    ...(work('flax') ? { flax: work('flax') } : {}),
  };
}

/** Stav vsi, jak by ho uložila feat/landscape: roční plán, `fallowBeforePlan`, bez značky. */
function legacyState(s: VillageState): VillageState {
  const copy = structuredClone(s) as VillageState & Record<string, unknown>;
  copy.plan = legacyPlan(copy.season);
  copy.threshingFromPlan = legacyPlan(copy.threshingSeason);
  delete (copy as Partial<VillageState>).season;
  delete (copy as Partial<VillageState>).threshingSeason;
  delete copy.sowingRotation;
  for (const part of copy.parts as (FieldPart & Record<string, unknown>)[]) {
    if (part.fallowBeforeSeason) part.fallowBeforePlan = part.fallowBeforeSeason;
    delete part.fallowBeforeSeason;
  }
  return copy;
}

/** Převod jako při načtení vsi (`updateVillage`): napřed tvar hospodářského roku, pak postup. */
const convert = (s: VillageState): VillageState => withSowingRotation(withSeason(s));

/**
 * Osivo plánu a výběr dílů (`selection`) z vsi `from` zpět do převedené vsi – roční plán je
 * neznal (jsou novější), tady se měří jen převod na osevní postup.
 */
function withSeedPlan(s: VillageState, from: VillageState): VillageState {
  const copy = (season: FarmSeason | null, source: FarmSeason | null): FarmSeason | null =>
    season && {
      ...season,
      ...(source?.seedWaitingKg ? { seedWaitingKg: source.seedWaitingKg } : {}),
      ...(source?.seedFloorKg !== undefined ? { seedFloorKg: source.seedFloorKg } : {}),
      ...(source?.selection ? { selection: source.selection } : {}),
    };
  return {
    ...s,
    season: copy(s.season, from.season),
    threshingSeason: copy(s.threshingSeason, from.threshingSeason),
  };
}

/** Zasetá plocha (ha) po plodinách a hotová práce v člověkodnech (všechny plodiny a orba). */
function progress(s: VillageState): { sownHa: Record<string, number>; doneMd: number } {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  const sownHa: Record<string, number> = {};
  let doneMd = 0;
  for (const { crop, work } of seasonCrops(s.season!)) {
    for (const id of work.partIds) {
      const part = byId.get(id)!;
      expect(part.state).toBe('sown');
      sownHa[crop] = (sownHa[crop] ?? 0) + part.areaM2 / 10_000;
    }
    for (const task of Object.keys(work.done) as TaskName[]) doneMd += work.done[task];
    doneMd += work.plough?.done ?? 0;
  }
  return { sownHa, doneMd };
}

describe('převod starších vsí na osevní postup', () => {
  const days: [string, number][] = [
    ['1. 9.', at(600, 9, 1)],
    ['25. 10. (setí ozimu)', at(600, 10, 25)],
    ['15. 3. (jarní příprava)', at(601, 3, 15)],
    ['15. 6. (pletí)', at(601, 6, 15)],
    ['10. 8. (žně a snopy)', at(601, 8, 10)],
  ];
  it.each(days)(
    'ves uložená %s – zaseté a rozdělané beze ztráty, dál stejně',
    (_, day) => {
      const now = stateAt(day);
      expect(now.sowingRotation).toBe(true);
      const old = legacyState(now);
      const converted = withSeedPlan(convert(old), now);
      expect(converted.sowingRotation).toBe(true);
      // hospodářský rok, díly i snopy stejné jako ve vsi, která převod nepotřebovala
      expect(converted.season).toEqual(now.season);
      expect(converted.threshingSeason).toEqual(now.threshingSeason);
      expect(converted.parts).toEqual(now.parts);
      expect(converted.sheaves).toEqual(now.sheaves);
      const before = progress(now);
      expect(progress(converted)).toEqual(before);
      // ves má zaseto a rozdělanou práci (1. 9. jen díly ozimu na řadě)
      expect(before.sownHa.winter).toBeGreaterThan(0);
      if (day > at(600, 9, 1)) expect(before.doneMd).toBeGreaterThan(0);
      // dopočet do konce hospodářského roku: stejná úroda, zásoby i hlad
      const end = at(601, 8, 31);
      expect(advanceVillage(converted, end, null)).toEqual(stateAt(end));
    },
    240_000,
  );

  it('čekající příprava osevu navíc (`extraLeft`) je nutná práce – potřebná ani hotová se nemění', () => {
    const now = stateAt(at(600, 10, 25));
    const old = legacyState(now) as VillageState & { plan: OldWork & { winter?: OldWork } };
    (old.plan.winter as OldWork & { extraLeft?: unknown }).extraLeft = { dig: 1.5, plough: 0.5 };
    (old.plan as OldWork & { extraLeft?: unknown }).extraLeft = { reclaim: 2 };
    const converted = withSeedPlan(convert(old), now);
    for (const crop of converted.season!.crops) expect('extraLeft' in crop).toBe(false);
    expect(converted.season).toEqual(now.season);
  });

  it('osev navíc: osévaný díl, který ležel ladem jen od plánu, je na řadě; příloh leží dál', () => {
    const now = stateAt(at(600, 10, 25));
    const old = legacyState(now) as VillageState & { plan: Record<string, unknown> };
    const inSeason = new Set(now.season!.crops.flatMap((c) => c.partIds));
    const [a, b] = old.parts.filter((p) => !inSeason.has(p.id) && p.state === 'ready');
    // feat/landscape dal díl osevu navíc do přílohu a léta v řadě si pamatoval v `extra`
    for (const p of [a!, b!]) {
      p.state = 'fallow';
      p.fallowSinceDay = at(600, 9, 1);
      p.sownYears = 0;
      p.overgrowthYears = 0;
    }
    old.plan.extra = [{ id: a!.id, sownYears: 2 }, { id: b!.id }];
    const converted = convert(old);
    expect('extra' in converted.season!).toBe(false);
    const after = new Map(converted.parts.map((p) => [p.id, p]));
    expect(after.get(a!.id)).toMatchObject({ state: 'ready', sownYears: 2, fallowSinceDay: null });
    expect(after.get(a!.id)!.overgrowthYears).toBeUndefined();
    expect(after.get(b!.id)).toMatchObject({ state: 'fallow', fallowSinceDay: at(600, 9, 1) });
    // vstup se nemění
    expect(old.parts.find((p) => p.id === a!.id)!.state).toBe('fallow');
  });

  it('příloh vracený do osevu si pamatuje stav před sezónou (`fallowBeforePlan`)', () => {
    const now = stateAt(at(600, 10, 25));
    const old = legacyState(now);
    const part = old.parts.find((p) => p.state === 'sown')! as FieldPart & Record<string, unknown>;
    part.fallowBeforePlan = { sinceDay: at(590, 9, 1), overgrowthYears: 2 };
    const converted = convert(old).parts.find((p) => p.id === part.id)!;
    expect(converted.fallowBeforeSeason).toEqual({ sinceDay: at(590, 9, 1), overgrowthYears: 2 });
    expect('fallowBeforePlan' in converted).toBe(false);
  });

  it('dvojí převod je jeden; ves bez plánu dostane jen značku', () => {
    const old = legacyState(stateAt(at(601, 3, 15)));
    const once = convert(old);
    expect(convert(once)).toBe(once);
    const fresh = { ...BASE };
    delete fresh.sowingRotation;
    expect(withSowingRotation(fresh)).toEqual({ ...fresh, sowingRotation: true });
  });

  it('při chybě převodu se ves načte – beze změny, se značkou', () => {
    const broken = convert(legacyState(stateAt(at(600, 10, 25))));
    delete broken.sowingRotation;
    (broken.season as unknown as { extra: unknown }).extra = [{ id: 1 }];
    (broken as unknown as { parts: unknown }).parts = null;
    const loaded = withSowingRotation(broken);
    expect(loaded.sowingRotation).toBe(true);
    expect(loaded.parts).toBeNull();
    expect(loaded.season).toBe(broken.season);
  });

  it('dopočet po kouscích dá totéž jako najednou', () => {
    const old = legacyState(stateAt(at(600, 10, 25)));
    const end = at(601, 1, 10);
    const whole = advanceVillage(old, end, null);
    let pieces = old;
    for (const day of [at(600, 10, 26), at(600, 11, 30), end]) {
      pieces = advanceVillage(pieces, day, null);
    }
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    expect(whole.sowingRotation).toBe(true);
  }, 120_000);
});
