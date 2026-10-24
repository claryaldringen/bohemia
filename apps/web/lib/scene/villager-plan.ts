import { AGE, type Craft, type Sex } from '@bohemia/game';
import type {
  LaborActivity,
  LaborShare,
  SceneLaborShare,
  SceneLabor,
  SceneVillage,
} from '../village-view';
import { weddingVillagersIn } from './wedding-plan';
import { MAX_TRAFFIC } from './road-traffic';
import type { ScenePerson } from '../person-view';
import { ADULTS, DayRoster, type PersonJob } from './villager-roster';
import {
  CHILD_UNDER,
  LEADER_AGE,
  MAX_WORKERS,
  WINTER_MONTHS,
  WOMEN,
  none,
  type Context,
  type DraftCrew,
  type DraftCrews,
  type Placer,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPlanOptions,
} from './villager-plan-types';
import { targetKey } from './villager-plan-geometry';
import {
  adultHair,
  cast,
  context,
  elderCount,
  figure,
  figureSexes,
  herderKinds,
  shareCounts,
  womenChance,
} from './villager-plan-cast';
import {
  carriers,
  fieldRows,
  founding,
  meadowRows,
  milkers,
  orchardPlanting,
  orchardTrees,
  planting,
  threshing,
  threshingOnFloor,
} from './villager-plan-fields';
import {
  builderNearby,
  building,
  cemeteryFence,
  felling,
  isConstructionShare,
  penFence,
  roadApples,
  roadWork,
} from './villager-plan-sites';
import {
  craftsmen,
  grainPitWorkers,
  kilnWorkers,
  oreDiggers,
  smithFetchFigures,
} from './villager-plan-crafts';
import { trafficFigures } from './villager-plan-traffic';
import { lordFigures } from './villager-plan-lord';
import { domestic, elders, herderPeople, herders, idlers, porters } from './villager-plan-folk';
import {
  activeFunerals,
  activeWeddings,
  caravanFigures,
  funeralFigures,
  weddingFigures,
} from './villager-plan-events';

// Postavy ve vsi (docs/design/villagers.md): kdo kde je a co dělá, jako čistá funkce vsi pro
// scénu – z rozdělení práce posledního dne (herní jádro, labor-report.ts), ne z vlastních
// pravidel. Člověkodny dne se převedou na postavy (jedna na pracujícího, nejvýš MAX_WORKERS)
// a rozestaví se k místům práce: řady na polích, nosiči mezi polem a obydlím, stavitelé kolem
// staveniště, dřevorubci u vyhrazených stromů, lidé v sadu, u hřbitova, výmlat u vsi, ženy
// u obydlí. Navíc starší u domů a děti u stád (nejsou práce vsi) a provoz na cestách – lidé, kteří
// jdou pro vodu, k lesu pro dřevo a mezi domem a polem (road-traffic.ts). Nikdo nestojí ve vodě,
// v domě nebo jámě ani na hrobech.

/**
 * Postavy vsi podle rozdělení práce posledního dne (`village.labor`). Bez rozdělení, lidí nebo
 * obydlí nikdo. Pracujících je tolik, kolik je člověkodní (venku – domácí práce a nečinní
 * jen z části), nejvýš `maxWorkers`; navíc starší u domů a pasáčci u stád.
 *
 * S lidmi vsi (`labor.persons` – villagers.md, Výběr postavy) je každá postava jeden skutečný
 * člověk (villager-roster.ts) a nikdo není ve dvou postavách: napřed lidé s pevným místem dne
 * (průvod pohřbu, karavany, nosiči kováře, pasáci, domácnosti dílen u své práce), pak stavby
 * (u každé aspoň jeden), práce vsi, provoz na cestách a nakonec domácí práce a nečinní; na koho
 * nezbude člověk, ta postava není (ves s málo lidmi). Pořadí postav ve výsledku je stejné jako
 * bez lidí.
 */
export function planVillagers(
  village: SceneVillage,
  ground: VillagerGround,
  options: VillagerPlanOptions,
): PlannedVillager[] {
  return planVillagersWithCrew(village, ground, options).people;
}

/**
 * Postavy vsi (`planVillagers`) a lidé u spřežení a vozů (`options.draft` – villagers.md, Výběr
 * postavy): spřežení a vozy jsou ve scéně vidět celý den, proto oráč, honák a vozka patří k lidem
 * s pevným místem dne – vozka vozu výpravy s karavanou, ostatní hned po pasácích (před dílnami,
 * stavbami a prací vsi); jejich podíl práce (orba, svoz) už postavy nemá.
 */
export function planVillagersWithCrew(
  village: SceneVillage,
  ground: VillagerGround,
  options: VillagerPlanOptions,
): { people: PlannedVillager[]; crew: DraftCrew } {
  const crew: DraftCrew = { teams: [], carts: [] };
  const labor = village.labor;
  if (!labor || village.dwellings.length === 0) return { people: [], crew };
  const ctx = context(
    village,
    ground,
    options.seed,
    labor.day,
    options.paths ?? null,
    figureSexes(labor.people),
    labor.persons ? dayRoster(labor, options.seed) : null,
  );
  // pohřby dne (cemetery.md – Pohřeb ve scéně): lidé průvodu ubírají z pracujících postav
  const funerals = activeFunerals(options.funerals ?? [], options.dayWindow?.(labor.day) ?? null);
  const mourning = funerals.reduce((sum, plan) => sum + plan.members.length, 0);
  // svatby dne (kinship.md – Svatba ve scéně): lidé vsi na svatbě ubírají z pracujících postav
  const dayWindow = options.dayWindow?.(labor.day) ?? null;
  const weddings = activeWeddings(options.weddings ?? [], dayWindow);
  const celebrating = weddings.reduce((sum, plan) => sum + weddingVillagersIn(plan, dayWindow), 0);
  const counts = shareCounts(
    labor.shares,
    labor.month,
    Math.max(0, (options.maxWorkers ?? MAX_WORKERS) - mourning - celebrating),
  );
  // lidé u spřežení a vozů (villagers.md – Výběr postavy) – postavy kreslí spřežení a vůz
  const staff = draftStaff(ctx, options.draft ?? null, crew);
  // lidé s pevným místem dne napřed – pohřeb, karavany, nosiči kováře a pasáci
  const mourners = funerals.flatMap((plan) => funeralFigures(ctx, plan));
  const celebrants = weddings.flatMap((plan) => weddingFigures(ctx, plan, dayWindow));
  const caravanPeople: PlannedVillager[] = [];
  for (const e of village.expeditions ?? []) {
    caravanPeople.push(...caravanFigures(ctx, e, options.dayWindow?.(e.day) ?? null));
  }
  // vozka vozu výpravy jde s karavanou
  staff.caravanCarts();
  // vojvodova rodina na dvorku (lord.md – Ve scéně): jediní, kdo stojí na oploceném pozemku
  // dvorce – cvičí, nebo vede domácnost; do práce vsi nejde
  const family = lordFigures(ctx, labor, dayWindow);
  const fetchers = smithFetchFigures(ctx, labor);
  const herding = herderPeople(ctx, labor);
  // spřežení a vozy jsou ve scéně vidět celý den – oráč, honák a vozka mají pevné místo dne
  staff.all();
  // výpravy k sousedům jdou jako karavany podle stavu výpravy (trade.md – Ve scéně), ne podle
  // práce dne – nosiči nezmizí, ani když výprava dnes nepostoupila
  const caravans = village.expeditions !== undefined;
  const slots: PlannedVillager[][] = labor.shares.map(() => []);
  const placers = new Map<number, Placer>();
  const tried = new Set<string>();
  const place = (s: number, i: number): void => {
    if (tried.has(`${s}:${i}`)) return;
    tried.add(`${s}:${i}`);
    const share = labor.shares[s]!;
    // orbu dělají oráč a honák u spřežení, vůz svozu vede vozka (`staff`) – postavy kreslí
    // spřežení a vůz
    if (share.activity === 'plough') return;
    if (share.activity === 'haul' && staff.haulCart(share, i) !== null) return;
    let place = placers.get(s);
    if (!place) {
      place = placer(ctx, share, counts[s] ?? 0);
      placers.set(s, place);
    }
    // kdo práci dělá, když to jádro ví (kovář a synové – crafts.md, Uhlí a ruda kováře)
    const age = share.ages ? share.ages[i % share.ages.length] : undefined;
    const child = age !== undefined && age < CHILD_UNDER;
    const c = cast(
      ctx,
      `${share.activity}:${targetKey(share.target)}:${i}`,
      { women: womenChance(WOMEN[share.activity], ctx.sexes.women), child },
      (sex) => shareWorker(ctx, share, i, sex, age),
    );
    if (!c) return;
    // u stavby musí někdo stát, i když zvláštní místo (strom, řada, plot) nevyšlo
    const pose =
      place(i, c.who) ?? (isConstructionShare(share) ? builderNearby(ctx, share, i, c.who) : null);
    if (!pose) {
      // místo nevyšlo – člověk zůstane volný pro jinou postavu
      if (c.person) ctx.roster?.release(c.person.id);
      return;
    }
    const hair = child ? 'natural' : adultHair(c.who, ctx.sexes.married);
    slots[s]![i] = figure(c, pose, hair, shareJob(share));
  };
  const wanted = (s: number): boolean =>
    (counts[s] ?? 0) > 0 && !(caravans && labor.shares[s]!.activity === 'trade');
  const all = (filter: (share: SceneLaborShare) => boolean): void =>
    labor.shares.forEach((share, s) => {
      if (!wanted(s) || !filter(share)) return;
      for (let i = 0; i < counts[s]!; i++) place(s, i);
    });
  // řemeslníci u své dílny, pak u každé stavby aspoň jeden, pak ostatní práce vsi
  all((share) => CRAFT_ACTIVITIES.has(share.activity));
  for (const s of firstBuilders(labor.shares, counts)) if (wanted(s)) place(s, 0);
  all((share) => !LATE_ACTIVITIES.has(share.activity));
  const traffic = trafficFigures(ctx, labor, options.maxTraffic ?? MAX_TRAFFIC);
  // domácí práce a nečinní – na koho zbude člověk
  all(() => true);
  const people: PlannedVillager[] = slots.flatMap((list) => list.filter(Boolean));
  const winter = WINTER_MONTHS.includes(labor.month);
  const tending = herderKinds(labor, options.herds);
  const elderHerders = tending.filter((kind) => kind === 'elder').length;
  people.push(...elders(ctx, elderCount(Math.max(0, labor.people.elders - elderHerders), winter)));
  people.push(...herders(ctx, tending, herding));
  people.push(...caravanPeople);
  people.push(...family);
  people.push(...traffic);
  people.push(...mourners);
  people.push(...celebrants);
  people.push(...fetchers);
  return { people, crew };
}

/**
 * Kdo je u spřežení a vozů (villagers.md – Výběr postavy): oráč je dospělý muž (jinak žena),
 * honák výrostek nejblíž LEADER_AGE (jinak dospělý – na poli ho kreslí postava honáčka), vozka
 * dospělý muž (jinak žena). Každé spřežení a každý vůz nejvýš jednou; bez lidí ve scéně nikdo
 * (null). Zapisuje do `crew` – spřežení v pořadí renderera, vozy výprav napřed, pak ostatní
 * v pořadí renderera. `haulCart` – vůz svozu, který vede `i`-tý člověk podílu svozu (postavu
 * nemá – je u vozu).
 */
export function draftStaff(
  ctx: Context,
  draft: DraftCrews | null,
  crew: DraftCrew,
): {
  haulCart(share: SceneLaborShare, i: number): number | null;
  caravanCarts(): void;
  all(): void;
} {
  const roster = ctx.roster;
  const drawn = new Set(draft?.carts ?? []);
  const staffed = new Set<number>();
  let teamsDone = false;
  const adult = (): number | null => roster?.take({ ...ADULTS, sex: 'male' })?.id ?? null;
  const teams = (): void => {
    if (teamsDone) return;
    teamsDone = true;
    for (let k = 0; k < (draft?.teams ?? 0); k++) {
      const ploughman = adult();
      const leader =
        roster?.take({ from: AGE.olderChild, to: AGE.elder, sex: 'male', age: LEADER_AGE })?.id ??
        null;
      crew.teams.push({ ploughman, leader });
    }
  };
  const cart = (id: number): void => {
    if (staffed.has(id) || !drawn.has(id)) return;
    staffed.add(id);
    crew.carts.push({ cart: id, drover: adult() });
  };
  // vozy svozu podle podílu (stejně jako honáci v placeru `haul`) – jen zapřažené
  const haulCarts = new Map<string, number[]>();
  for (const c of ctx.village.carts ?? []) {
    if (c.job?.activity !== 'haul' || (c.route?.length ?? 0) < 2 || !drawn.has(c.id)) continue;
    const key = targetKey(c.job.target);
    haulCarts.set(key, [...(haulCarts.get(key) ?? []), c.id]);
  }
  return {
    haulCart: (share, i) => haulCarts.get(targetKey(share.target))?.[i] ?? null,
    caravanCarts: () => {
      for (const c of ctx.village.carts ?? []) if (c.job?.activity === 'trade') cart(c.id);
    },
    all: () => {
      teams();
      for (const id of draft?.carts ?? []) cart(id);
    },
  };
}

/**
 * Lidé dne k rozdělení mezi postavy (villager-roster.ts): domácnosti dílen, které dnes pracují
 * v dílně, kopou rudu či hlínu nebo nosí kováři (crafts.md), jdou jen k práci své domácnosti.
 */
export function dayRoster(labor: SceneLabor, seed: number): DayRoster {
  const busy = new Set<number>();
  for (const share of labor.shares) {
    const t = share.target;
    if (share.activity === 'craft' && (t.kind === 'dwelling' || t.kind === 'kiln')) busy.add(t.id);
    if (
      (share.activity === 'ore' || share.activity === 'clay') &&
      (t.kind === 'ore' || t.kind === 'clay')
    ) {
      busy.add(t.id);
    }
    if (share.activity === 'fetch') {
      const from =
        t.kind === 'kiln' ? t.from : t.kind === 'ore' || t.kind === 'clay' ? t.id : undefined;
      if (from !== undefined) busy.add(from);
    }
  }
  return new DayRoster(labor.persons ?? [], seed, labor.day, busy);
}

/** Práce dílen a jejich domácností – řemeslníci dostanou lidi napřed (crafts.md). */
export const CRAFT_ACTIVITIES: ReadonlySet<LaborActivity> = new Set([
  'craft',
  'ore',
  'clay',
  'plant',
]);

/** Domácí práce, dojení, péče o zvířata a nečinní – dostanou lidi až po provozu na cestách. */
export const LATE_ACTIVITIES: ReadonlySet<LaborActivity> = new Set([
  'domestic',
  'milking',
  'animal-care',
  'idle',
]);

/**
 * U které stavby stojí první člověk (`withBuilderAtEachConstruction`): u každé stavby dne první
 * podíl, který dostal postavu – index podílu.
 */
export function firstBuilders(
  shares: readonly Pick<LaborShare, 'activity' | 'target' | 'construction' | 'manDays'>[],
  counts: readonly number[],
): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  shares.forEach((share, s) => {
    if (!isConstructionShare(share) || (counts[s] ?? 0) <= 0) return;
    const key =
      share.construction !== undefined
        ? `c${share.construction}`
        : `${share.activity}:${targetKey(share.target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });
  return out;
}

/** Lehčí polní práce, které smějí dělat i ženy řemeslníků (jako `LIGHT_LABOR_TASKS` v jádře). */
const LIGHT_ACTIVITIES: ReadonlySet<string> = new Set([
  'sow',
  'weed',
  'harvest',
  'carry',
  'thresh',
]);

/**
 * Kdo dělá podíl práce: řemeslník a jeho domácnost u dílny (i uhlíř u milíře), kovář a synové
 * u rudiště nebo hliniště podle věku z jádra, uhlíř sází buky, dílna kácí svůj strom; ostatní
 * dospělí vsi – u domácí práce, dojení a nečinných přednostně z domu, u kterého postava stojí.
 */
export function shareWorker(
  ctx: Context,
  share: SceneLaborShare,
  i: number,
  sex: Sex,
  age: number | undefined,
): ScenePerson | null {
  const roster = ctx.roster!;
  const t = share.target;
  const own = (id: number): ReadonlySet<number> => new Set([id]);
  if (share.activity === 'craft' && (t.kind === 'dwelling' || t.kind === 'kiln')) {
    // řemeslo dělá jen řemeslník a jeho synové, ženy ne (crafts.md – Kdo dělá řemeslo)
    return (
      roster.take({ ...ADULTS, homes: own(t.id), onlySex: 'male' }) ??
      roster.take({ from: AGE.olderChild, to: Infinity, homes: own(t.id), onlySex: 'male' }) ??
      (roster.hasMen(t.id)
        ? null
        : (roster.take({ ...ADULTS, homes: own(t.id), sex }) ??
          roster.take({ from: AGE.olderChild, to: Infinity, homes: own(t.id), sex })))
    );
  }
  if (
    (share.activity === 'ore' || share.activity === 'clay') &&
    (t.kind === 'ore' || t.kind === 'clay')
  ) {
    return roster.take({
      from: AGE.olderChild,
      to: Infinity,
      homes: own(t.id),
      sex: 'male',
      ...(age !== undefined ? { age } : {}),
    });
  }
  if (
    share.activity === 'plant' ||
    (share.activity === 'fell' && share.construction === undefined)
  ) {
    // uhlíř sází a kácí buky, dílny kácejí svůj strom (crafts.md) – napřed uhlíři, pak dílny
    const burners = craftHomes(ctx, (craft) => craft === 'burner');
    const crafts = craftHomes(ctx, (craft) => craft === 'burner' || craft === 'potter');
    return (
      (burners.size > 0 ? roster.take({ ...ADULTS, homes: burners, onlySex: 'male' }) : null) ??
      (crafts.size > 0 ? roster.take({ ...ADULTS, homes: crafts, onlySex: 'male' }) : null) ??
      roster.take({ ...ADULTS, sex })
    );
  }
  const home = homeHint(ctx, share, i);
  return roster.take({
    ...ADULTS,
    sex,
    ...(LIGHT_ACTIVITIES.has(share.activity) ? { light: true } : {}),
    ...(home !== null ? { preferHome: home } : {}),
  });
}

/** Obydlí dílen s řemeslem, které projde `filter`. */
export function craftHomes(ctx: Context, filter: (craft: Craft) => boolean): ReadonlySet<number> {
  return new Set(ctx.village.dwellings.filter((d) => d.craft && filter(d.craft)).map((d) => d.id));
}

/** U kterého domu postava podílu stojí (domácí práce, dojení, nečinní – jako jejich placer). */
export function homeHint(ctx: Context, share: SceneLaborShare, i: number): number | null {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  if (homes.length === 0) return null;
  if (share.activity === 'domestic' || share.activity === 'milking') {
    return share.target.kind === 'pen' ? null : homes[i % homes.length]!.id;
  }
  if (share.activity === 'idle') return homes[Math.floor(i / 2) % homes.length]!.id;
  return null;
}

/** Co dělá postava podílu práce (panel postavy). */
export function shareJob(share: SceneLaborShare): PersonJob {
  return {
    kind: 'share',
    activity: share.activity,
    target: share.target,
    ...(share.job ? { job: share.job } : {}),
  };
}

export function placer(ctx: Context, share: SceneLaborShare, count: number): Placer {
  const t = share.target;
  switch (share.activity) {
    case 'dig':
    case 'reclaim':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'hoe') : none;
    case 'sow':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'seed') : none;
    case 'weed':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'weed') : none;
    case 'harvest':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'reap') : none;
    case 'carry':
      return t.kind === 'field' ? carriers(ctx, share, t.id) : none;
    case 'found-field':
      return t.kind === 'field' ? founding(ctx, share, t.id, count) : none;
    case 'thresh':
      // hotové humno: mlátí se na něm; nouzový výmlat (cíl ves) na udusané zemi u vsi
      return t.kind === 'threshing-floor'
        ? threshingOnFloor(ctx, t.id, count)
        : threshing(ctx, count);
    case 'plough':
      // oráč a honáček jsou součástí spřežení (plough-team-renderer.ts)
      return none;
    case 'mow':
      if (t.kind === 'meadow') return meadowRows(ctx, t.cells, count);
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'reap') : none;
    case 'milking':
      // dojení u domů – ženy u dojných zvířat vedle obydlí (diet.md)
      return milkers(ctx);
    case 'animal-care':
      // v zimě u ohrady (krmení, voda, kydání), jinak u domů (prasata, slepice)
      return t.kind === 'pen' ? penFence(ctx, t.id) : domestic(ctx);
    case 'slaughter':
      // porážka a uzení u vsi (diet.md) – na udusané zemi kousek od domů jako výmlat
      return threshing(ctx, count);
    case 'herding':
      // dospělí pasáci stojí u stád spolu s dětmi (`herders`, diet.md – Pasáci)
      return none;
    case 'pen':
      return t.kind === 'pen' ? penFence(ctx, t.id) : none;
    case 'orchard-harvest':
    case 'orchard-care':
      if (t.kind === 'road') return roadApples(ctx, t.id, count, 'tree');
      return t.kind === 'orchard' ? orchardTrees(ctx, t.id, count) : none;
    case 'orchard-plant':
      if (t.kind === 'road') return roadApples(ctx, t.id, count, 'planting');
      return t.kind === 'orchard' ? orchardPlanting(ctx, t.id, count) : none;
    case 'cemetery':
      return t.kind === 'cemetery' ? cemeteryFence(ctx, t.id) : none;
    case 'fell':
      if (t.kind === 'trees') return felling(ctx, t.ids, share.construction !== undefined);
      if (t.kind === 'pen') return penFence(ctx, t.id);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'build':
      if (t.kind === 'road') return roadWork(ctx, t.id);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'repair':
      // opravy obydlí, oprava modly a svatyně (abandonment.md – Oprava) – lidé kolem stavby
      return t.kind === 'dwelling' || t.kind === 'sacred' ? building(ctx, t, 'build') : none;
    case 'craft':
      if (t.kind === 'kiln') return kilnWorkers(ctx, t);
      return t.kind === 'dwelling' ? craftsmen(ctx, t.id) : none;
    case 'plant':
      // uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa)
      return t.kind === 'trees' ? planting(ctx, t.ids) : none;
    case 'domestic':
      return domestic(ctx);
    case 'trade':
      // nosiči výpravy k sousedovi po zemské stezce (trade.md); nákup u souseda bez stezky jde
      // krajinou rovně ke kraji mapy (crafts.md – Nákup u sousedů)
      if (t.kind === 'edge') return porters(ctx, null, [ctx.center, t]);
      return t.kind === 'trail' ? porters(ctx, t.id) : none;
    case 'haul': {
      // honák a nakladač s vozem (wagons.md – Vůz): nakladač u svozu jako nosiči snopů, sekáči
      // na louce a dřevorubci u stromů; honák jde s vozem (kreslí ho cart-renderer.ts – fáze 3);
      // s uhlím a vodou (Co vozy vozí) jde posádka s vozem – nakladače nekreslí; s osivem stojí
      // nakladač na poli jako nosiči
      const crew =
        share.job === 'charcoal' || share.job === 'water'
          ? none
          : t.kind === 'field'
            ? carriers(ctx, share, t.id)
            : t.kind === 'meadow'
              ? meadowRows(ctx, t.cells, count)
              : t.kind === 'trees'
                ? felling(ctx, t.ids, false)
                : none;
      const key = targetKey(t);
      const drovers = (ctx.village.carts ?? []).filter(
        (c) =>
          c.job?.activity === 'haul' &&
          (c.route?.length ?? 0) >= 2 &&
          targetKey(c.job.target) === key,
      ).length;
      return drovers > 0 ? (i, who) => (i < drovers ? null : crew(i, who)) : crew;
    }
    case 'ore':
      // kovář a synové od 14 let kopou rudu u jámy na rudišti (crafts.md – Uhlí a ruda kováře)
      return t.kind === 'ore' ? oreDiggers(ctx, t) : none;
    case 'clay':
      // hrnčíř a synové od 14 let kopou hlínu u jámy na hliništi (crafts.md – Hlína hrnčíře)
      return t.kind === 'clay' ? oreDiggers(ctx, t) : none;
    case 'grain-pit':
      // vesničané kopou obilnou jámu, nosí do ní zrno a pečetí ji (production-chains.md – Obilné
      // jámy) – kolem hrdla
      return t.kind === 'grain-pit' ? grainPitWorkers(ctx, t) : none;
    case 'fetch':
      // nošení uhlí a rudy v koších jde jako provoz na cestách (`smithFetchFigures`)
      return none;
    case 'idle':
      return idlers(ctx);
  }
}

// Rozcestník: původní veřejné exporty přesunuté do podmodulů villager-plan-*.
export {
  CLOTH_COLORS,
  FIGURE_SCALE,
  LEADER_AGE,
  MAX_ELDERS,
  MAX_WORKERS,
} from './villager-plan-types';
export type {
  DraftCrew,
  DraftCrews,
  FigureSexes,
  HairLook,
  PlannedVillager,
  VillagerGround,
  VillagerLook,
  VillagerPaths,
  VillagerPlanOptions,
} from './villager-plan-types';
export { houseBox, plotBox, siteBox, walkRoute } from './villager-plan-geometry';
export {
  crewSplit,
  elderCount,
  figureCounts,
  figureSexes,
  herderKinds,
  shareCounts,
  womenChance,
} from './villager-plan-cast';
export {
  MAX_FUNERAL_FIGURES_TOTAL,
  MAX_WEDDING_FIGURES_TOTAL,
  planFunerals,
  planWeddings,
} from './villager-plan-events';
