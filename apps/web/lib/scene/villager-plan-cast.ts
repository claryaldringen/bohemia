// Obsazení postav lidmi, vzhled (vlasy, oděv, pohlaví) a počty postav.
import { AGE, PEN_FENCE_INSET_M, SACRED_BUILDINGS, type Sex } from '@bohemia/game';
import type { LaborActivity, LaborShare, SceneLabor, SceneVillage } from '../village-view';
import { scenePenSquares } from '../village-view';
import { hash01 } from './smoke-schedule';
import { sceneFrame } from './village-layout';
import { type PoseFn, type VillagerKind } from './villager-motion';
import { MILIR_SHAPE_M } from './workshop-layout';
import { isMarriedWomanRole } from '../person-roles';
import type { ScenePerson } from '../person-view';
import { DayRoster, type PersonJob } from './villager-roster';
import {
  CHILD_UNDER,
  CLOTH_COLORS,
  CREW,
  ELDERS_PER_FIGURE,
  FIGURE_SCALE,
  FOREST_KILN_ID_OFFSET,
  MARRIED,
  MAX_ELDERS,
  MAX_WORKERS,
  OUTDOORS,
  WINTER_MONTHS,
  type Context,
  type FigureSexes,
  type HairLook,
  type House,
  type Identity,
  type PlannedVillager,
  type VillagerGround,
  type VillagerLook,
  type VillagerPaths,
} from './villager-plan-types';
import { houseBox, plotBox, siteBox, stringHash } from './villager-plan-geometry';
import { withBuilderAtEachConstruction } from './villager-plan-sites';

/**
 * Kdo stojí u stád (diet.md – Pasáci): pasáci z jádra – výrostci 7–13 let (v rozdělení práce
 * z doby před 19. 10. 2026 i starší a dospělí – podíl `herding`, člověkoden = pasák) –, nejvýš
 * jeden u každého stáda ve scéně. Rozdělení práce z doby před pasáky je nemá – pak děti jako dřív.
 */
export function herderKinds(
  labor: Pick<SceneLabor, 'people' | 'shares' | 'herders'>,
  herds: number,
): ('child' | 'elder' | 'adult')[] {
  const free = labor.herders ?? { children: labor.people.children, elders: 0 };
  const adults = Math.ceil(
    labor.shares
      .filter((share) => share.activity === 'herding')
      .reduce((sum, share) => sum + share.manDays, 0) - 1e-6,
  );
  const kinds: ('child' | 'elder' | 'adult')[] = [
    ...Array<'child'>(free.children).fill('child'),
    ...Array<'elder'>(free.elders ?? 0).fill('elder'),
    ...Array<'adult'>(Math.max(0, adults)).fill('adult'),
  ];
  return kinds.slice(0, Math.max(0, herds));
}

/**
 * Kolik postav dostane který podíl práce: postavy se spočítají po činnostech (figureCounts)
 * a v činnosti se rozdělí po skupinách až CREW lidí tam, kde je práce nejvíc (crewSplit) – lidé
 * pracují pohromadě, ne každý na jiném z desítek polí.
 */
export function shareCounts(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays' | 'target' | 'construction'>[],
  month: number,
  max: number = MAX_WORKERS,
): number[] {
  const groups = new Map<LaborActivity, number[]>();
  shares.forEach((share, i) =>
    groups.set(share.activity, [...(groups.get(share.activity) ?? []), i]),
  );
  const activities = [...groups.entries()];
  const totals = figureCounts(
    activities.map(([activity, members]) => ({
      activity,
      manDays: members.reduce((sum, i) => sum + shares[i]!.manDays, 0),
    })),
    month,
    max,
  );
  const counts = shares.map(() => 0);
  activities.forEach(([activity, members], g) => {
    const split = crewSplit(
      members.map((i) => shares[i]!.manDays),
      totals[g] ?? 0,
      // řemeslníci pracují každý ve své dílně – žádné skupiny po čtyřech (crafts.md)
      activity === 'craft' ? 1 : CREW,
    );
    members.forEach((i, k) => (counts[i] = split[k] ?? 0));
  });
  return withBuilderAtEachConstruction(shares, counts, max);
}

/**
 * Rozdělí `count` lidí mezi místa s prací `weights` po skupinách až `crew` lidí: každá skupina
 * jde tam, kde zbývá nejvíc práce na člověka (při shodě dřívější místo).
 */
export function crewSplit(weights: readonly number[], count: number, crew: number): number[] {
  const out = weights.map(() => 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (count <= 0 || total <= 0) return out;
  const unit = total / count;
  let left = count;
  while (left > 0) {
    const size = Math.min(crew, left);
    let best = 0;
    let bestNeed = -Infinity;
    weights.forEach((w, i) => {
      const need = w - out[i]! * unit;
      if (need > bestNeed + 1e-9) {
        best = i;
        bestNeed = need;
      }
    });
    out[best] = (out[best] ?? 0) + size;
    left -= size;
  }
  return out;
}

/**
 * Kolik postav dostane která činnost: člověkodny × podíl venku, celkem zaokrouhleně
 * (nejvýš `max`, pak poměrně menší), rozdělené metodou největších zbytků (deterministicky).
 */
export function figureCounts(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays'>[],
  month: number,
  max: number = MAX_WORKERS,
): number[] {
  const winter = WINTER_MONTHS.includes(month);
  const wanted = shares.map((s) => {
    const outdoors = OUTDOORS[s.activity];
    return Math.max(0, s.manDays) * (outdoors ? (winter ? outdoors.winter : outdoors.summer) : 1);
  });
  const sum = wanted.reduce((a, b) => a + b, 0);
  const total = Math.min(max, Math.round(sum));
  if (total <= 0 || sum <= 0) return wanted.map(() => 0);
  const exact = wanted.map((w) => (w * total) / sum);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    left--;
  }
  return counts;
}

/** Starší u domů: na každé dva jedna postava, nejvýš MAX_ELDERS; v zimě polovina venku. */
export function elderCount(elders: number, winter: boolean): number {
  const shown = Math.min(MAX_ELDERS, Math.ceil(Math.max(0, elders) / ELDERS_PER_FIGURE));
  return winter ? Math.floor(shown / 2) : shown;
}

// --- kontext a vzhled ----------------------------------------------------------------------

export function context(
  village: SceneVillage,
  ground: VillagerGround,
  seed: number,
  day: number,
  paths: VillagerPaths | null,
  sexes: FigureSexes = figureSexes(null),
  roster: DayRoster | null = null,
): Context {
  const dwellings: House[] = village.dwellings.map((d) => {
    // dům i staveniště podle varianty rozměrů domu (population.md – Varianty rozměrů)
    const frame = sceneFrame(d);
    return {
      id: d.id,
      position: d.position,
      built: d.built,
      progress: d.progress,
      inhabited: d.built && d.inhabited !== false,
      box: d.plot
        ? plotBox(d.position, d.plot)
        : d.built
          ? houseBox(d.type, frame)
          : siteBox(d.type, frame),
      frame,
      ...(d.plot
        ? {
            own: houseBox(d.type, frame),
            plot: {
              x: d.plot.x,
              z: d.plot.z,
              size: d.plot.size,
              ...(d.plot.rotation !== undefined ? { rotation: d.plot.rotation } : {}),
            },
          }
        : {}),
      ...(d.craft ? { craft: d.craft } : {}),
    };
  });
  // milíř uhlíře – lidé ho obcházejí (do kupy se nevstupuje), řemeslníci stojí kolem něj
  // milíře uhlířů – samostatné stavby u skácených buků (crafts.md – Milíř u skácených buků)
  const forestKilns: House[] = (village.kilns ?? []).map((k) => {
    const half = MILIR_SHAPE_M.radius;
    return {
      id: FOREST_KILN_ID_OFFSET - k.id,
      position: { x: k.x, z: k.z, rotation: 0 },
      built: true,
      progress: 1,
      inhabited: false,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    };
  });
  // modla a svatyně: stavitelé stojí kolem půdorysu, hotové lidé obcházejí (happiness.md)
  const sacred: House[] = (village.sacred?.buildings ?? []).map((b) => {
    const half = SACRED_BUILDINGS[b.kind].footprintM / 2;
    return {
      id: b.id,
      position: b.position,
      built: b.built,
      progress: b.progress,
      inhabited: false,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    };
  });
  // ohrady (oxen.md): oplocené čtverce – lidé stojí za plotem, dovnitř nechodí (ohrada o víc
  // čtvercích – oxen.md, Ohrady podle druhu – každý čtverec)
  const pens: House[] = (village.pens ?? []).flatMap((pen) => {
    const squares = scenePenSquares(pen);
    const rotation = pen.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const half = pen.size / 2;
    return squares.map((q) => {
      // plot stojí PEN_FENCE_INSET_M uvnitř čtverce (paths.md – Ploty): okraj čtverce je ulička,
      // kterou projde chodec; strana, kde navazuje další čtverec téže ohrady, plot nemá
      const inset = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
      for (const o of squares) {
        if (o === q) continue;
        const dx = o.x - q.x;
        const dz = o.z - q.z;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lz) < half && Math.abs(lx) > half) inset[lx > 0 ? 'maxX' : 'minX'] = -1;
        if (Math.abs(lx) < half && Math.abs(lz) > half) inset[lz > 0 ? 'maxZ' : 'minZ'] = -1;
      }
      const fence = (side: keyof typeof inset): number =>
        inset[side] === 0 ? PEN_FENCE_INSET_M : 0;
      return {
        id: pen.id,
        // natočená ohrada (fields.md – Natočené stavby) – čtverec v osách ohrady
        position: { x: q.x, z: q.z, rotation },
        built: pen.built,
        progress: pen.progress,
        inhabited: false,
        box: {
          minX: -half + fence('minX'),
          maxX: half - fence('maxX'),
          minZ: -half + fence('minZ'),
          maxZ: half - fence('maxZ'),
        },
        pen: true as const,
      };
    });
  });
  const houses = [...dwellings, ...forestKilns, ...sacred, ...pens];
  for (const h of houses) {
    h.cos = Math.cos(h.position.rotation);
    h.sin = Math.sin(h.position.rotation);
    h.reach = Math.hypot(Math.max(-h.box.minX, h.box.maxX), Math.max(-h.box.minZ, h.box.maxZ));
  }
  const homes = dwellings.filter((h) => h.inhabited);
  const settled = homes.length > 0 ? homes : dwellings.length > 0 ? dwellings : houses;
  const center = {
    x: settled.reduce((s, h) => s + h.position.x, 0) / settled.length,
    z: settled.reduce((s, h) => s + h.position.z, 0) / settled.length,
  };
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  return {
    village,
    ground,
    seed,
    day,
    sexes,
    center,
    houses,
    homes: settled,
    graves,
    paths,
    roster,
  };
}

export function identity(
  seed: number,
  key: string,
  options: { women: number; child: boolean },
): Identity {
  const s = (seed * 31 + stringHash(key)) | 0;
  const kind: VillagerKind = hash01(s, 1, 91) < options.women ? 'woman' : 'man';
  const r = hash01(s, 2, 91);
  const scale = options.child
    ? 0.62 + r * 0.12
    : kind === 'woman'
      ? 0.96 + r * 0.07
      : 0.95 + r * 0.1;
  return { key, kind, scale: scale * FIGURE_SCALE, phase: hash01(s, 3, 91), seed: s };
}

/** Postava a člověk, kterým je (villagers.md – Výběr postavy); bez lidí ve scéně `person` null. */
export interface Cast {
  who: Identity;
  person: ScenePerson | null;
}

/** Postava, která není člověk vsi (lidé, kteří se stěhují k sousedovi nebo od něj přicházejí). */
export const STRANGER = 'stranger';

/**
 * Identita postavy: bez lidí ve scéně (dřívější pohled, ukázky) z klíče a podílu žen jako dřív;
 * s lidmi (`ctx.roster`) je postava skutečný člověk – `pick` ho vybere (přednostně pohlaví podle
 * losu postavy, ať činnost drží podíl žen) a postava má jeho pohlaví a velikost. Nikdo volný –
 * null (postava není). Cizí postava (`STRANGER`) zůstane jako dřív.
 */
export function cast(
  ctx: Context,
  key: string,
  look: { women: number; child: boolean },
  pick: ((sex: Sex) => ScenePerson | null) | typeof STRANGER,
): Cast | null {
  const who = identity(ctx.seed, key, look);
  if (!ctx.roster || pick === STRANGER) return { who, person: null };
  const person = pick(who.kind === 'woman' ? 'female' : 'male');
  if (!person) return null;
  return {
    who: identity(ctx.seed, key, {
      women: person.sex === 'female' ? 1 : 0,
      child: person.age < CHILD_UNDER,
    }),
    person,
  };
}

/** Vlasy postavy podle člověka: starší šediny, děti a svobodné bez šátku, vdaná žena šátek. */
export function personHair(who: Identity, person: ScenePerson): HairLook {
  if (person.age >= AGE.elder) return 'grey';
  if (person.age < CHILD_UNDER || who.kind !== 'woman' || !isMarriedWomanRole(person.role)) {
    return 'natural';
  }
  return hash01(who.seed, 7, 91) < 0.75 ? 'linen' : 'madder';
}

/** Postava z identity a pózy; s člověkem jeho vlasy, id a co dělá (`job`). */
export function figure(c: Cast, pose: PoseFn, hair: HairLook, job: PersonJob): PlannedVillager {
  const out = villager(c.who, pose, c.person ? personHair(c.who, c.person) : hair);
  if (c.person) {
    out.person = c.person.id;
    out.job = job;
  }
  return out;
}

export function clothOf(seed: number): VillagerLook['cloth'] {
  let pick = hash01(seed, 4, 91);
  const shade = 0.95 + hash01(seed, 5, 91) * 0.1;
  for (const { color, share } of CLOTH_COLORS) {
    pick -= share;
    if (pick < 0) return [color[0] * shade, color[1] * shade, color[2] * shade];
  }
  const last = CLOTH_COLORS[0]!.color;
  return [last[0] * shade, last[1] * shade, last[2] * shade];
}

/** Podíl `part` z `part + other`, nebo null, když nikdo není. */
export function shareOf(part: number | undefined, other: number | undefined): number | null {
  if (part === undefined || other === undefined || part + other === 0) return null;
  return part / (part + other);
}

export function figureSexes(people: SceneLabor['people'] | null): FigureSexes {
  if (!people) return { women: null, elderWomen: null, girls: null, married: null };
  const women = (people.women ?? 0) + (people.elderWomen ?? 0);
  return {
    women: shareOf(people.women, people.men),
    elderWomen: shareOf(people.elderWomen, people.elderMen),
    girls: shareOf(people.girls, people.boys),
    married:
      people.couples === undefined || women === 0 ? null : Math.min(1, people.couples / women),
  };
}

/**
 * Pravděpodobnost, že postava činnosti je žena: výchozí podíl činnosti `base` (počítá s vsí půl
 * na půl) posunutý podle podílu žen ve vsi `share` – poměr šancí se vynásobí. Ves bez žen má jen
 * muže, ves bez mužů jen ženy; bez údaje `base`.
 */
export function womenChance(base: number, share: number | null): number {
  if (share === null) return base;
  if (share <= 0 || base <= 0) return 0;
  if (share >= 1 || base >= 1) return 1;
  const odds = (base / (1 - base)) * (share / (1 - share));
  return odds / (1 + odds);
}

/**
 * Vdané ženy nosí šátek – většinou lněný, některé barvený mořenou. Podíl vdaných podle vsi
 * (`married`), bez údaje MARRIED.
 */
export function adultHair(who: Identity, married: number | null = null): HairLook {
  if (who.kind !== 'woman' || hash01(who.seed, 6, 91) >= (married ?? MARRIED)) return 'natural';
  return hash01(who.seed, 7, 91) < 0.75 ? 'linen' : 'madder';
}

export function villager(who: Identity, pose: PoseFn, hair: HairLook): PlannedVillager {
  return {
    key: who.key,
    kind: who.kind,
    scale: who.scale,
    phase: who.phase,
    look: { cloth: clothOf(who.seed), hair },
    pose,
  };
}
