// Porážka jako postavy vsi (diet.md – Porážka ve scéně, slaughter-plan.ts): stanoviště z kusů
// poražených dnes, parta z dospělých 16+ (řezník a pomocníci přednostně z domácnosti, které maso
// patří, žena s miskou) – lidé party nedělají nic jiného, zbytek podílu porážky beze změny.
import { AGE, penGateToward, penSquaresEntrance, type Sex } from '@bohemia/game';
import type { SceneLabor, SceneLaborShare } from '../village-view';
import { scenePenSquares, scenePenSpecies } from '../village-view';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import {
  SLAUGHTER_MIN_AGE,
  slaughterPlan,
  slaughterPose,
  type DayWindow,
  type SlaughterGate,
  type SlaughterHome,
  type SlaughterInput,
  type SlaughterPlan,
  type SlaughterRole,
} from './slaughter-plan';
import { walkSpeed } from './villager-motion';
import type { ScenePerson } from '../person-view';
import type { PersonRequest } from './villager-roster';
import type { Context, PlannedVillager, Square } from './villager-plan-types';
import {
  doorPoint,
  free,
  inSquare,
  trafficDoor,
  unit,
  walkRoute,
  worldPoint,
} from './villager-plan-geometry';
import { adultHair, cast, figure, type Cast } from './villager-plan-cast';

/** Dospělí pro porážku – 16 let až starší (rules-people AGE). */
const CREW_AGES: Pick<PersonRequest, 'from' | 'to'> = { from: SLAUGHTER_MIN_AGE, to: AGE.elder };

/** Podíl žen podle role (bez lidí ve scéně): řezník muž, s miskou žena, pomocníci spíš muži. */
const ROLE_WOMEN: Record<SlaughterRole, number> = { butcher: 0, bowl: 1, holder: 0.3, helper: 0.3 };

/** Branka hotové ohrady skotu (bez ní ohrady spřežení), nebo null. */
function cattleGate(ctx: Context): SlaughterGate | null {
  const pens = (ctx.village.pens ?? []).filter((pen) => pen.built);
  const pen =
    pens.find((p) => scenePenSpecies(p) === 'cattle') ??
    pens.find((p) => scenePenSpecies(p) === 'team');
  if (!pen) return null;
  const squares = scenePenSquares({
    ...pen,
    extraSquares: (pen.extraSquares ?? []).filter((q) => !q.pending),
  });
  const gate = penSquaresEntrance(squares, penGateToward(squares, ctx.village.dwellings));
  return { x: gate.x, z: gate.z, outX: gate.outX, outZ: gate.outZ };
}

/** Vstup plánu porážky ze vsi: obydlí (vchod a směr ven), branka skotu, schůdná zem, trasy. */
export function slaughterInput(
  ctx: Context,
  labor: SceneLabor,
  figures: number,
  window: DayWindow,
): SlaughterInput {
  const homes: SlaughterHome[] = ctx.homes.map((h) => {
    // směr ven z domu = lokální +z (k vchodu)
    const p0 = worldPoint(h.position, 0, 0);
    const p1 = worldPoint(h.position, 0, 1);
    return {
      id: h.id,
      door: trafficDoor(ctx, h) ?? doorPoint(h),
      out: unit(p1.x - p0.x, p1.z - p0.z),
    };
  });
  // kozlina ani zvíře nestojí na poli, v sadu ani na hrobě
  const squares: Square[] = [
    ...ctx.village.fields.flatMap((f) => f.parts),
    ...(ctx.village.orchards ?? []).flatMap((o) => o.squares),
  ];
  return {
    heads: labor.slaughter,
    day: labor.day,
    seed: ctx.seed,
    window,
    homes,
    cattleGate: cattleGate(ctx),
    figures,
    standable: (x, z) => free(ctx, x, z) && !squares.some((s) => inSquare(s, x, z, 0.3)),
    route: (a, b) => walkRoute(ctx, a, b)?.points ?? null,
  };
}

/** Kdo dělá roli: přednostně z domácnosti stanoviště, řezník muž, s miskou žena. */
function crewPerson(ctx: Context, role: SlaughterRole, home: number, sex: Sex): ScenePerson | null {
  const roster = ctx.roster!;
  const own = new Set([home]);
  const only: Sex | null = role === 'butcher' ? 'male' : role === 'bowl' ? 'female' : null;
  if (only) {
    return (
      roster.take({ ...CREW_AGES, homes: own, onlySex: only }) ??
      roster.take({ ...CREW_AGES, onlySex: only }) ??
      roster.take({ ...CREW_AGES, preferHome: home, sex })
    );
  }
  return (
    roster.take({ ...CREW_AGES, homes: own, sex }) ??
    roster.take({ ...CREW_AGES, preferHome: home, sex })
  );
}

/**
 * Porážka dne jako postavy (slaughter-plan.ts): bez kusů (`labor.slaughter`), hodin světa nebo
 * podílu porážky nic. Postav pro porážku je tolik, kolik má podíl `slaughter` (aspoň 2, nejvýš
 * dospělých vsi); `used` – kolik z nich parta vzala (zbytek podílu dělá, co dřív).
 */
export function slaughterFigures(
  ctx: Context,
  labor: SceneLabor,
  share: SceneLaborShare | null,
  shareFigures: number,
  window: DayWindow | null,
): { plan: SlaughterPlan | null; people: PlannedVillager[]; used: number } {
  const none = { plan: null, people: [], used: 0 };
  if (!labor.slaughter || !share || !window || ctx.homes.length === 0) return none;
  const figures = Math.min(Math.max(2, shareFigures), Math.max(1, labor.people.adults));
  const casts = new Map<string, Cast[]>();
  const plan = slaughterPlan(slaughterInput(ctx, labor, figures, window), (site, wanted) => {
    const got: { role: SlaughterRole; c: Cast }[] = [];
    for (const role of wanted) {
      const c = cast(
        ctx,
        `slaughter-crew:${site.key}:${role}`,
        { women: ROLE_WOMEN[role], child: false },
        (sex) => crewPerson(ctx, role, site.home, sex),
      );
      if (c) got.push({ role, c });
    }
    if (got[0]?.role !== 'butcher') {
      for (const g of got) if (g.c.person) ctx.roster?.release(g.c.person.id);
      return [];
    }
    casts.set(
      site.key,
      got.map((g) => g.c),
    );
    return got.map((g) => g.role);
  });
  if (!plan) return none;
  const job = { kind: 'share', activity: share.activity, target: share.target } as const;
  const people = plan.stations.flatMap((station) =>
    (casts.get(station.key) ?? []).map((c, m) => {
      const speed = walkSpeed(c.who.kind, 'walk', c.who.scale);
      return figure(
        c,
        (t, _herds, out) =>
          slaughterPose(plan, station, m, speed, t * 1000 + LIVESTOCK_EPOCH_MS, out),
        adultHair(c.who, ctx.sexes.married),
        job,
      );
    }),
  );
  return { plan, people, used: people.length };
}
