import type { WorkshopDay } from './crafts';
import { isVillageExtinct } from './extinction';
import { penSpecies } from './pens';
import { horsePens, horsesInPlaces, penHorses } from './horses';
import type { GrainPitDay } from './grain-pits';
import type { DayAllocation, LaborTaskName } from './labor';
import { villageOrchards } from './orchard';
import { NO_CRAFTS, harvestCarryShare } from './productivity';
import { ROAD_APPLES, SMITH_SUPPLY } from './rules';
import { mowingSquaresWorked } from './hay';
import type {
  CartJob,
  Construction,
  CropWork,
  HayMowing,
  LaborActivity,
  LaborDay,
  LaborShare,
  LaborTarget,
  StructureRepair,
  VillageState,
  FarmSeason,
} from './types';
import { roadApplesWorkRoad } from './road-apples';
import { roadWorkFront } from './road-upgrades';
import { trailWorkRoad } from './trail';
import { wagonWorkTarget } from './wagon-road';
import { woodFellingCost } from './wood';
import { partsWorked, type PartTask } from './field-progress';
import { seasonPartIds, type CropTask } from './year-plan';
import { partsByIdOf } from './parts-by-id';

/** Hektar v m² – plocha sadu na jabloň u cesty. */
const M2_PER_HA = 10_000;

// Rozdělení práce posledního odsimulovaného dne po činnostech a místech – jen pro zobrazení
// (postavy ve scéně, villagers.md). Vzniká v kroku práce simulace ze stejného rozdělení, které
// simulace použila; simulace ho nečte. Žádná nová pravidla – jen kam práce dne šla.

/** Práce vložená dnes do jedné stavby a stav stavby před ní (kácení jde první – forest.md). */
export interface ConstructionWork {
  construction: Construction;
  manDays: number;
  doneBefore: number;
  felledBefore: number;
}

/** Polní úloha dne: práce plodiny a kolik z ní bylo hotové před a po dnešní práci (člověkodny). */
export interface FieldTaskWork {
  task: CropTask;
  work: CropWork;
  before: number;
  after: number;
  /**
   * Práce vsi na úloze bez honáků a nakladačů vozů (wagons.md – úloha s vozy postoupí víc, než
   * na ni ves dala práce); bez údaje = postup (`after − before`).
   */
  labor?: number;
}

/**
 * Svoz vozy dne (wagons.md – Vůz): na co vozy jely (snopy ze sklizně, seno ze seče, klády ke
 * stavbám, uhlí od milíře a ruda z rudiště ke kováři, osivo na setí a voda v sudech – Co vozy
 * vozí), práce honáků, nakladačů a sedláků a kolik vozů jelo; u klád stromy, u kterých se
 * nakládalo, u uhlí milíř, u rudy rudiště a u vody břeh (`target`). Posádka vozu s vodou je
 * v denním minimu (přirážka za vodu), klády ze společné práce, sedlák s uhlím a rudou z práce vsi
 * před úlohami (`DayAllocation.carting` – crafts.md, Uhlí a ruda kováře), ostatní v práci úlohy.
 */
export interface HaulWork {
  job: 'harvest' | 'mow' | 'logs' | 'charcoal' | 'ore' | 'clay' | 'seed' | 'water' | 'apples';
  manDays: number;
  carts: number;
  /** Z vozů čtyřkoláky; chybí = žádný. */
  four?: number;
  trees?: number[];
  target?: LaborTarget;
}

/** Co krok práce simulace dnes rozdělil. */
export interface DayWork {
  allocation: DayAllocation;
  /** Polní úlohy dne po plodinách (bez nich se práce polí dělí podle plochy plánu). */
  fieldWork?: FieldTaskWork[];
  /**
   * Práce dílů nad potřebu ze společné práce – po stavbách (fields.md – Osevní postup po dílech,
   * bod 3); její úlohy jsou ve `fieldWork`. Bez údaje 0.
   */
  surplusField?: number;
  /** Seč navíc z práce po stavbách (oxen.md – Seno, dvě seče; člověkodny). Bez údaje 0. */
  extraMow?: number;
  /** Ryby a oka vesničanů ze zbytku práce (W7; wildlife.md); bez údaje žádné. */
  smallGame?: { activity: LaborActivity; target: LaborTarget; manDays: number }[];
  /**
   * Věk dětí, které dnes plejí (fields.md – Pletí – děti) – jejich díl pletí
   * (`allocation.weedChildren`) jde do zvláštního podílu s `ages` (malé postavy ve scéně).
   */
  weedChildAges?: readonly number[];
  /** Opravy po obydlích (poměrně k potřebě). */
  repairs: { dwellingId: number; manDays: number }[];
  constructions: ConstructionWork[];
  /**
   * Seč sena dne – kolik bylo posečeno před a po dnešní práci (oxen.md); `labor` = práce vsi bez
   * honáků a nakladačů vozů (wagons.md), bez údaje = postup.
   */
  mowing?: { mowing: HayMowing; before: number; after: number; labor?: number };
  /** Práce řemeslníků po dílnách (crafts.md); bez údaje žádná. */
  workshops?: WorkshopDay[];
  /**
   * Cvičící vojvodova rodina (lord.md – Den rodiny): denní minimum dvorce z práce rodiny
   * (člověkodny – do domácí práce jako u dílen) a počty lidí pro `LaborDay.lord`; bez údaje
   * rodina pracuje jako ostatní.
   */
  lord?: { domestic: number; counts: NonNullable<LaborDay['lord']> };
  /** Pokrytí nástroji dne – podíl žně a odnosu na sklizni (meze); bez údaje 0. */
  toolCoverage?: number;
  /** Nosiči výprav k sousedům po zemských stezkách (trade.md); bez údaje žádní. */
  trade?: { trailId: number; manDays: number; carts?: number }[];
  /** Svoz vozy (wagons.md – Vůz); bez údaje žádný. */
  hauls?: HaulWork[];
  /**
   * Skupiny nákupu u sousedů na cestě (crafts.md – Nákup u sousedů) – stezka, nebo kraj mapy; jsou
   * celé dny pryč (mimo práci vsi); bez údaje žádné.
   */
  purchases?: { target: LaborTarget; manDays: number }[];
  /** Výrostci 7–13 let, kteří dnes pasou (diet.md – Pasáci); bez údaje se neví. */
  herders?: { children: number };
  /**
   * Výmlat dne (production-chains.md – Humno): práce na hotových humnech a nouzově na udusané zemi
   * u domů (rok odkladu starší vsi); bez údaje celý výmlat u vsi.
   */
  threshing?: { floor: number; ground: number };
  /**
   * Práce na obilných jamách (production-chains.md – Obilné jámy): kopání, vypalování, nošení zrna
   * z humna a pečetění – u jámy, do které jde dávka (i nové, kterou kopou); bez údaje žádná.
   */
  grainPits?: GrainPitDay;
  /** Práce bokem – mimo práci vsi, jen pro postavy (`AsideWork`); bez údaje žádná. */
  aside?: AsideWork;
}

/**
 * Práce bokem dne (člověkodny) – mimo práci vsi (population.md – Práce; Martin 19. 10. 2026):
 * dojení a sýr, péče o zvířata (ženy), domácí výroba žen a denní minimum, které pokryli starší.
 */
export interface AsideWork {
  milking: number;
  care: number;
  domestic: number;
}

/** Kolik kácených stromů jedné stavby rozdělení ukáže. */
export const LABOR_TREES_SHOWN = 3;
/** Méně člověkodní se do rozdělení nezapíše. */
const MIN_MAN_DAYS = 0.001;

const FIELD_ACTIVITIES: readonly LaborTaskName[] = ['reclaim', 'dig', 'sow', 'weed', 'harvest'];

/**
 * Rozdělení práce dne podle míst (stav po práci dne – mutovat se smí až potom). Polní úlohy jdou
 * na díly, přes které dnes práce postoupila (čelo práce – field-progress.ts), sečtené po polích
 * s id těch dílů v cíli; sklizeň na žeň a odnos podle sazeb (fields.md), výmlat na hotová humna
 * rovným dílem (nosí se k nim snopy a odnáší zrno – production-chains.md, Humno), nouzový výmlat
 * na udusané zemi u vsi. Sezónní práce v sadech podle plochy vysazených čtverců.
 */
export function laborDay(state: VillageState, day: number, work: DayWork): LaborDay {
  const shares: LaborShare[] = [];
  const add = (
    activity: LaborActivity,
    target: LaborTarget,
    manDays: number,
    construction?: number,
    carts?: number,
    job?: CartJob,
    ages?: readonly number[],
    fourWheel?: number,
  ): void => {
    const rounded = Math.round(manDays * 1000) / 1000;
    if (rounded < MIN_MAN_DAYS) return;
    shares.push({
      activity,
      target,
      manDays: rounded,
      ...(construction === undefined ? {} : { construction }),
      ...(carts ? { carts } : {}),
      ...(fourWheel ? { fourWheel } : {}),
      ...(job ? { job } : {}),
      ...(ages && ages.length > 0 ? { ages: [...ages] } : {}),
    });
  };
  const { allocation } = work;
  const carryShare = harvestCarryShare(work.toolCoverage ?? NO_CRAFTS.tools);
  const hauls = work.hauls ?? [];
  // svoz vozy (wagons.md): k největší dnešní práci téže úlohy (sklizeň, seč, setí), klády
  // u stromů, voda u břehu (Co vozy vozí – `job`)
  const haulTo = (job: HaulWork['job'], target: LaborTarget | null, limit = Infinity): number => {
    let total = 0;
    for (const haul of hauls) {
      if (haul.job !== job) continue;
      const place =
        job === 'logs'
          ? haul.trees && haul.trees.length > 0
            ? ({ kind: 'trees', ids: haul.trees } as const)
            : null
          : (haul.target ?? target);
      const manDays = Math.min(haul.manDays, limit - total);
      total += manDays;
      const cartJob =
        job === 'seed' || job === 'water' || job === 'charcoal' || job === 'ore' || job === 'clay'
          ? job
          : undefined;
      add(
        'haul',
        place ?? { kind: 'village' },
        manDays,
        undefined,
        haul.carts,
        cartJob,
        undefined,
        haul.four,
      );
    }
    return total;
  };

  let harvestTarget: { target: LaborTarget; manDays: number } | null = null;
  let sowTarget: { target: LaborTarget; manDays: number } | null = null;
  // díl dětí na pletí (fields.md – Pletí – děti) – malé postavy podle věku
  const kidsAges = work.weedChildAges ?? [];
  const kidsWeed =
    kidsAges.length > 0 && allocation.tasks.weed > 0
      ? Math.min(1, (allocation.weedChildren ?? 0) / allocation.tasks.weed)
      : 0;
  // díl žen vsi na pletí dospělých (fields.md – Pletí jednou a rychle) – postavy hlavně ženy
  const adultWeed = allocation.tasks.weed - (allocation.weedChildren ?? 0);
  const womenWeed =
    adultWeed > 0 ? Math.min(1, Math.max(0, (allocation.weedWomen ?? 0) / adultWeed)) : 0;
  const addWeed = (target: LaborTarget, manDays: number): void => {
    const before = shares.length;
    add('weed', target, manDays * (1 - kidsWeed));
    const adults = shares[before];
    if (adults && womenWeed > 0) adults.women = Math.round(womenWeed * 1000) / 1000;
    if (kidsWeed > 0) {
      add('weed', target, manDays * kidsWeed, undefined, undefined, undefined, kidsAges);
    }
  };
  for (const { task, fieldId, manDays, parts, progress } of fieldShares(state, day, work)) {
    const target: LaborTarget =
      parts.length > 0
        ? { kind: 'field', id: fieldId, parts, ...(progress ? { progress } : {}) }
        : { kind: 'field', id: fieldId };
    if (task === 'harvest') {
      add('harvest', target, manDays * (1 - carryShare));
      add('carry', target, manDays * carryShare);
      if (!harvestTarget || manDays > harvestTarget.manDays) harvestTarget = { target, manDays };
    } else if (task === 'weed') {
      addWeed(target, manDays);
    } else {
      add(task, target, manDays);
      if (task === 'sow' && (!sowTarget || manDays > sowTarget.manDays)) {
        sowTarget = { target, manDays };
      }
    }
  }
  haulTo('harvest', harvestTarget?.target ?? null);
  haulTo('seed', sowTarget?.target ?? null);
  threshShares(state, work.threshing, allocation.tasks.thresh, add);
  // obilné jámy – u jámy, do které se dnes ukládá zrno (production-chains.md – Obilné jámy)
  if (work.grainPits) {
    const { pit, manDays } = work.grainPits;
    add('grain-pit', { kind: 'grain-pit', id: pit.id, x: pit.x, z: pit.z }, manDays);
  }
  let mowTarget: { target: LaborTarget; manDays: number } | null = null;
  for (const share of mowingShares(state, work)) {
    add('mow', share.target, share.manDays);
    if (!mowTarget || share.manDays > mowTarget.manDays) mowTarget = share;
  }
  haulTo('mow', mowTarget?.target ?? null);
  haulTo('logs', null);
  // uhlí a ruda ke kováři vozem se sedlákem (crafts.md – Uhlí a ruda kováře) – u milíře a rudiště
  haulTo('charcoal', null);
  haulTo('ore', null);
  haulTo('clay', null);
  add('slaughter', { kind: 'village' }, allocation.tasks.slaughter);
  // noční hlídka polí dospělými (wildlife.md – Obrana polí) – úloha práce, ne propadlá práce
  add('watch', { kind: 'village' }, allocation.tasks.watch);
  const orchards = orchardAreas(state);
  for (const task of ['orchard-care', 'orchard-harvest'] as const) {
    for (const { target, share } of orchards) {
      add(task, target, allocation.tasks[task] * share);
    }
  }
  // jablka ze sadu vozem (orchard.md – Jablka vozem) – u největšího sadu
  const orchardTarget = orchards
    .filter((o) => o.target.kind === 'orchard')
    .sort((a, b) => b.share - a.share)[0]?.target;
  haulTo('apples', orchardTarget ?? null);

  for (const repair of work.repairs) {
    add('repair', { kind: 'dwelling', id: repair.dwellingId }, repair.manDays);
  }
  const workshops = work.workshops ?? [];
  // voda v sudech (wagons.md – Co vozy vozí): posádka vozu je v denním minimu – u břehu, ne doma
  const waterCrew = haulTo('water', null, allocation.dailyMin);
  // denní minimum vsi i domácností dílen (z práce dospělých – co po starších zbude)
  add(
    'domestic',
    { kind: 'village' },
    allocation.dailyMin -
      waterCrew +
      workshops.reduce((sum, w) => sum + w.domestic, 0) +
      (work.lord?.domestic ?? 0),
  );
  // péče o koně (horses.md – Péče): koňák ráno a večer u ohrad koní, poměrně k počtu koní
  horseCareShares(state, day, allocation.horseCare, add);
  // kování koní vlastním kovářem (horses.md – Kování): kovář u ohrady koní
  horseCareShares(state, day, allocation.shoeing ?? 0, add, 'horse-shoeing');
  // řemeslníci: uhlíř a hrnčíř kácejí u svého stromu, výroba v dílně – uhlíř u svých milířů
  // (samostatné stavby u skácených buků – crafts.md, Milíř u skácených buků), a sází mladé buky
  // na pařezy (crafts.md – Uhlíř)
  for (const w of workshops) {
    const place: LaborTarget = { kind: 'dwelling', id: w.dwellingId };
    add(
      'fell',
      w.fellingTrees.length > 0 ? { kind: 'trees', ids: w.fellingTrees } : place,
      w.felling,
    );
    if (w.kilns && w.kilns.length > 0) {
      for (const k of w.kilns) {
        const target: LaborTarget = {
          kind: 'kiln',
          id: w.dwellingId,
          x: k.x,
          z: k.z,
          ...(k.id !== undefined ? { kiln: k.id } : {}),
        };
        add('craft', target, k.making);
      }
    } else {
      add('craft', place, w.making);
    }
    // měchař u tavby – syn 10–13 mimo práci dílny, ten den nepase (production-chains.md – Kovář);
    // dospělý měchař je v práci dílny
    const bellows = w.smelt?.bellows;
    if (bellows?.kind === 'son') {
      add('craft', place, SMITH_SUPPLY.youngsterShare, undefined, undefined, undefined, [
        bellows.age,
      ]);
    }
    // kovář: kopání rudy na rudišti, nošení uhlí od milíře a rudy z rudiště (crafts.md – Uhlí
    // a ruda kováře) – kdo to dělá (věky); jízda s vozem pro rudu s vozem
    if (w.ore) {
      const { manDays, ages, x, z } = w.ore;
      add(
        'ore',
        { kind: 'ore', id: w.dwellingId, x, z },
        manDays,
        undefined,
        undefined,
        undefined,
        ages,
      );
    }
    // hrnčíř: kopání hlíny na hliništi (crafts.md – Hlína hrnčíře)
    if (w.clay) {
      const { manDays, ages, x, z } = w.clay;
      add(
        'clay',
        { kind: 'clay', id: w.dwellingId, x, z },
        manDays,
        undefined,
        undefined,
        undefined,
        ages,
      );
    }
    for (const f of w.fetch ?? []) {
      add('fetch', f.target, f.manDays, undefined, f.cart ? 1 : undefined, undefined, f.ages);
    }
    if (w.planting) {
      const stumps = w.plantedTrees ?? [];
      add('plant', stumps.length > 0 ? { kind: 'trees', ids: stumps } : place, w.planting);
    }
  }

  // nosiči výprav k sousedům – po zemské stezce (trade.md); mají vlastní podíl práce
  // (`allocation.away`), společnou práci neberou
  for (const t of work.trade ?? []) {
    add('trade', { kind: 'trail', id: t.trailId }, t.manDays, undefined, t.carts);
  }
  // nákup u sousedů – malá skupina po stezce nebo krajinou ke kraji mapy (crafts.md)
  for (const p of work.purchases ?? []) add('trade', p.target, p.manDays);
  // opravy obydlí jdou ze společné práce po stavbách (population.md – Práce), díly nad potřebu
  // z toho, co zbude po nich (fields.md – Osevní postup po dílech, bod 3)
  let invested =
    work.repairs.reduce((sum, r) => sum + r.manDays, 0) +
    (work.surplusField ?? 0) +
    (work.extraMow ?? 0);
  for (const g of work.smallGame ?? []) {
    invested += g.manDays;
    add(g.activity, g.target, g.manDays);
  }
  // honáci a nakladači klád jdou ze společné práce (wagons.md); sedláci s uhlím a rudou mají
  // vlastní podíl práce vsi před úlohami (`allocation.carting` – crafts.md, Uhlí a ruda kováře)
  for (const haul of hauls) if (haul.job === 'logs') invested += haul.manDays;
  for (const c of work.constructions) {
    invested += c.manDays;
    for (const share of constructionShares(c, state)) {
      add(share.activity, share.target, share.manDays, c.construction.id);
    }
  }
  add('idle', { kind: 'village' }, allocation.common - invested);
  const slaughtered = state.livestock?.slaughtered;
  return {
    day,
    shares,
    ...(work.herders !== undefined ? { herders: work.herders } : {}),
    ...(work.aside ? { aside: asideShares(state, work.aside) } : {}),
    ...(work.lord ? { lord: work.lord.counts } : {}),
    ...(slaughtered?.day === day ? { slaughterHeads: { ...slaughtered.heads } } : {}),
  };
}

/**
 * Péče o koně dne po ohradách koní (poměrně k počtu koní s místem), bez hotové ohrady u vsi.
 * Podíl je mimo společnou práci (`allocation.horseCare` se bere hned za denním minimem).
 */
function horseCareShares(
  state: VillageState,
  day: number,
  total: number,
  add: (activity: LaborActivity, target: LaborTarget, manDays: number) => void,
  activity: 'horse-care' | 'horse-shoeing' = 'horse-care',
): void {
  if (total <= 0) return;
  const pens = horsePens(state)
    .filter((p) => p.builtDay !== null)
    .map((pen) => ({ id: pen.id, horses: horsesInPlaces(penHorses(pen), day) }))
    .filter((p) => p.horses > 0);
  const horses = pens.reduce((sum, p) => sum + p.horses, 0);
  if (horses === 0) {
    add(activity, { kind: 'village' }, total);
    return;
  }
  for (const pen of pens) add(activity, { kind: 'pen', id: pen.id }, (total * pen.horses) / horses);
}

/**
 * Výmlat dne po místech (production-chains.md – Humno): práce na humnech rovným dílem mezi hotová
 * humna, nouzový výmlat na udusané zemi u vsi; bez rozdělení (starší volání) celý u vsi.
 */
function threshShares(
  state: VillageState,
  threshing: DayWork['threshing'],
  total: number,
  add: (activity: LaborActivity, target: LaborTarget, manDays: number) => void,
): void {
  const floors = (state.threshingFloors ?? []).filter((f) => f.builtDay !== null);
  if (!threshing || floors.length === 0) {
    add('thresh', { kind: 'village' }, total);
    return;
  }
  for (const floor of floors) {
    add('thresh', { kind: 'threshing-floor', id: floor.id }, threshing.floor / floors.length);
  }
  add('thresh', { kind: 'village' }, threshing.ground);
}

/**
 * Práce bokem jako podíly pro postavy: dojení u domů, péče o zvířata v zimě u ohrady (když ves
 * nějakou má – diet.md), jinak u domů, domácí výroba u domů.
 */
function asideShares(state: VillageState, aside: AsideWork): LaborShare[] {
  const pen = (state.pens ?? []).find((p) => p.builtDay !== null && penSpecies(p) !== 'horse');
  const shares: LaborShare[] = [];
  const add = (activity: LaborActivity, target: LaborTarget, manDays: number): void => {
    const rounded = Math.round(manDays * 1000) / 1000;
    if (rounded >= MIN_MAN_DAYS) shares.push({ activity, target, manDays: rounded });
  };
  add('milking', { kind: 'village' }, aside.milking);
  add('animal-care', pen ? { kind: 'pen', id: pen.id } : { kind: 'village' }, aside.care);
  add('domestic', { kind: 'village' }, aside.domestic);
  return shares;
}

/**
 * Polní práce dne po polích: s polními úlohami po plodinách na díly, přes které práce dnes
 * postoupila (podíl podle úseku dílu), jinak (starší volání) poměrně k ploše polí v plánu.
 */
function fieldShares(state: VillageState, day: number, work: DayWork): FieldShare[] {
  const { allocation, fieldWork } = work;
  if (!fieldWork) {
    const fields = FIELD_ACTIVITIES.some((t) => allocation.tasks[t] > 0)
      ? planFieldAreas(state)
      : [];
    return FIELD_ACTIVITIES.flatMap((task) =>
      fields.map(({ id, share }) => ({
        task: task as PartTask,
        fieldId: id,
        manDays: allocation.tasks[task] * share,
        parts: [],
      })),
    );
  }
  if (!fieldWork.some(({ task, before, after }) => task !== 'thresh' && after > before)) return [];
  const partsById = partsByIdOf(state.parts);
  const shares = new Map<string, FieldShare>();
  for (const { task, work: crop, before, after, labor } of fieldWork) {
    if (task === 'thresh' || after - before <= 0) continue;
    for (const part of partsWorked(crop, partsById, task, day, before, after)) {
      const key = `${task}:${part.fieldId}`;
      const share = shares.get(key) ?? { task, fieldId: part.fieldId, manDays: 0, parts: [] };
      share.manDays += (labor ?? after - before) * part.share;
      if (!share.parts.includes(part.id)) {
        share.parts.push(part.id);
        // orba: kudy dnes spřežení na dílu prošlo (scéna projede celou dnešní orbu – oxen.md)
        if (task === 'plough') {
          share.progress = [...(share.progress ?? []), [round3(part.from), round3(part.to)]];
        }
      }
      shares.set(key, share);
    }
  }
  return [...shares.values()];
}

/** Polní práce dne na jednom poli (úloha, člověkodny, díly a u orby postup na dílech). */
interface FieldShare {
  task: PartTask;
  fieldId: number;
  manDays: number;
  parts: number[];
  progress?: [number, number][];
}

/** Na tisíciny. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Seč dne na louky, přes které dnes postoupila: díly úhoru po polích, přirozené louky zvlášť
 * (podíl podle úseku louky).
 */
function mowingShares(
  state: VillageState,
  work: DayWork,
): { target: LaborTarget; manDays: number }[] {
  const day = work.mowing;
  if (!day || day.after - day.before <= 0) return [];
  // s vozy postoupila seč víc, než na ni ves dala práce (wagons.md)
  const scale = day.labor !== undefined ? day.labor / (day.after - day.before) : 1;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const fields = new Map<number, { manDays: number; parts: number[] }>();
  const meadow = { manDays: 0, cells: [] as { x: number; y: number }[] };
  for (const sq of mowingSquaresWorked(day.mowing, partsById, day.before, day.after)) {
    const manDays = (day.after - day.before) * sq.share * scale;
    if (sq.partId !== undefined && sq.fieldId !== undefined) {
      const share = fields.get(sq.fieldId) ?? { manDays: 0, parts: [] };
      share.manDays += manDays;
      share.parts.push(sq.partId);
      fields.set(sq.fieldId, share);
    } else if (sq.cell) {
      meadow.manDays += manDays;
      meadow.cells.push(sq.cell);
    }
  }
  const shares: { target: LaborTarget; manDays: number }[] = [...fields].map(([id, share]) => ({
    target: { kind: 'field', id, parts: share.parts },
    manDays: share.manDays,
  }));
  if (meadow.cells.length > 0) {
    shares.push({ target: { kind: 'meadow', cells: meadow.cells }, manDays: meadow.manDays });
  }
  return shares;
}

/**
 * Rozdělení práce posledního odsimulovaného dne; ves uložená před jeho zavedením null. Vymřelá
 * ves nepracuje – její poslední den (kdy ještě někdo pracoval) se už neukazuje.
 */
export function laborReport(state: Pick<VillageState, 'labor' | 'extinctDay'>): LaborDay | null {
  if (isVillageExtinct(state)) return null;
  return state.labor ?? null;
}

/**
 * Podíly polí na ploše hospodářského roku se počítají znovu, jen když se změní jeho díly (nutné
 * díly přibývají i ubývají – `seasonDay`); plocha ani pole dílu se nemění; simulace se ptá každý
 * den.
 */
const planAreas = new WeakMap<
  FarmSeason,
  { parts: string; shares: { id: number; share: number }[] }
>();

/** Pole s díly v letošním plánu a jejich podíl na ploše plánu (podle id pole). */
function planFieldAreas(state: VillageState): { id: number; share: number }[] {
  const plan = state.season;
  if (plan === null) return [];
  const cached = planAreas.get(plan);
  const partIds = seasonPartIds(plan);
  const key = partIds.join(',');
  if (cached && cached.parts === key) return cached.shares;
  const inPlan = new Set(partIds);
  const areas = new Map<number, number>();
  let total = 0;
  for (const part of state.parts) {
    if (!inPlan.has(part.id)) continue;
    areas.set(part.fieldId, (areas.get(part.fieldId) ?? 0) + part.areaM2);
    total += part.areaM2;
  }
  const shares =
    total <= 0
      ? []
      : [...areas].sort(([a], [b]) => a - b).map(([id, area]) => ({ id, share: area / total }));
  planAreas.set(plan, { parts: key, shares });
  return shares;
}

/**
 * Sady s vysazenými čtverci a úseky cest s vysazenými jabloněmi (roads.md – jabloň jako sad na
 * strom, ≈ 1/180 ha) a jejich podíl na vysazené ploše.
 */
function orchardAreas(state: VillageState): { target: LaborTarget; share: number }[] {
  const areas: { target: LaborTarget; area: number }[] = villageOrchards(state).map((o) => ({
    target: { kind: 'orchard', id: o.id },
    area: o.squares.reduce((sum, s) => sum + (s.plantedDay !== null ? s.areaM2 : 0), 0),
  }));
  const perApple = M2_PER_HA / ROAD_APPLES.treesPerHa;
  const byRoad = new Map<number, number>();
  for (const apple of state.roads?.apples ?? []) {
    if (apple.plantedDay === null) continue;
    byRoad.set(apple.roadId, (byRoad.get(apple.roadId) ?? 0) + perApple);
  }
  for (const [id, area] of byRoad) areas.push({ target: { kind: 'road', id }, area });
  const total = areas.reduce((sum, a) => sum + a.area, 0);
  if (total <= 0) return [];
  return areas.filter((a) => a.area > 0).map((a) => ({ target: a.target, share: a.area / total }));
}

/**
 * Práce jedné stavby po místech: obydlí a přestavba nejdřív kácejí své stromy (forest.md) –
 * u stromů, které ještě stojí (nebo u posledního skáceného, když dnes kácení skončilo), zbytek
 * se staví na staveništi / u obydlí. Pole, sad, hřbitov a oprava stavby se dělají na svém místě.
 */
function constructionShares(work: ConstructionWork, state: VillageState): LaborShare[] {
  const c = work.construction;
  if (c.kind === 'field') {
    return c.fieldId === null
      ? []
      : [
          {
            activity: 'found-field',
            target: { kind: 'field', id: c.fieldId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'orchard') {
    return c.orchardId === null || c.orchardId === undefined
      ? []
      : [
          {
            activity: 'orchard-plant',
            target: { kind: 'orchard', id: c.orchardId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'pen' || c.kind === 'ard') {
    if (c.penId === null || c.penId === undefined) return [];
    return penShares(work, { kind: 'pen', id: c.penId });
  }
  if (c.kind === 'road-apples') {
    // jabloně se sázejí po řadě podél cesty – u úseku první nevysazené
    const roadId = roadApplesWorkRoad(state, c);
    return roadId === null
      ? []
      : [
          {
            activity: 'orchard-plant',
            target: { kind: 'road', id: roadId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'road' && c.earthwork !== undefined) {
    // vozová cesta (roads.md – Vozová cesta) – na čele práce, úsek ještě není cestou
    const target = wagonWorkTarget(state, c);
    return target ? penShares(work, target, 'build') : [];
  }
  if (c.kind === 'road') {
    // vylepšení pevné cesty (roads.md) – kácení dřeva hatě, pak práce na úseku, kam stavba po
    // cestě došla (cesta hráče – víc úseků); zemská stezka (trade.md) na úseku, kam stavba od vsi
    // ven došla
    const roadId =
      (c.trail !== undefined ? trailWorkRoad(state, c) : roadWorkFront(state, c)) ?? c.roadIds?.[0];
    return roadId === undefined ? [] : penShares(work, { kind: 'road', id: roadId }, 'build');
  }
  if (c.kind === 'cemetery') {
    return c.cemeteryId === null || c.cemeteryId === undefined
      ? []
      : [
          {
            activity: 'cemetery',
            target: { kind: 'cemetery', id: c.cemeteryId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'repair') return c.repair ? [repairShare(c.repair, work.manDays)] : [];
  // přestavba na místě pracuje u obydlí, přestavba na novém pozemku (polozemnice bez pozemku) na
  // staveništi
  const place: LaborTarget | null =
    c.kind === 'rebuild' && c.position === null
      ? c.dwellingId === null
        ? null
        : { kind: 'dwelling', id: c.dwellingId }
      : { kind: 'site', id: c.id };
  if (place === null) return [];
  return penShares(work, place, 'build');
}

/**
 * Oprava stavby (abandonment.md – Oprava) na jejím místě: plot hřbitova po obvodu jako ohrazení,
 * ohrada jako stavba ohrady, modla a svatyně u stavby.
 */
function repairShare(repair: StructureRepair, manDays: number): LaborShare {
  if (repair.structure === 'cemetery-fence') {
    return { activity: 'cemetery', target: { kind: 'cemetery', id: repair.id }, manDays };
  }
  if (repair.structure === 'pen') {
    return { activity: 'pen', target: { kind: 'pen', id: repair.id }, manDays };
  }
  return { activity: 'repair', target: { kind: 'sacred', id: repair.id }, manDays };
}

/**
 * Práce stavby se dřevem po místech: nejdřív kácení jejích stromů (forest.md), zbytek na místě
 * stavby – obydlí a staveniště (`build`), ohrada a rádlo (`pen`).
 */
function penShares(
  work: ConstructionWork,
  place: LaborTarget,
  activity: LaborActivity = 'pen',
): LaborShare[] {
  const c = work.construction;
  const felling = woodFellingCost(c.wood);
  const fellWork = Math.max(
    0,
    Math.min(work.manDays, Math.min(c.done, felling) - Math.min(work.doneBefore, felling)),
  );
  const shares: LaborShare[] = [];
  if (fellWork > 0) {
    const trees = fellingTrees(work);
    shares.push({
      activity: 'fell',
      target: trees.length > 0 ? { kind: 'trees', ids: trees } : place,
      manDays: fellWork,
    });
  }
  if (work.manDays - fellWork > 0) {
    shares.push({ activity, target: place, manDays: work.manDays - fellWork });
  }
  return shares;
}

/** Stromy, u kterých se dnes kácelo: ještě stojící v pořadí kácení, jinak poslední skácený. */
function fellingTrees(work: ConstructionWork): number[] {
  const wood = work.construction.wood;
  if (!wood) return [];
  const standing = wood.fell
    .slice(wood.felled, wood.felled + LABOR_TREES_SHOWN)
    .flatMap((t) => (t.id === null ? [] : [t.id]));
  if (standing.length > 0) return standing;
  const last = wood.fell
    .slice(work.felledBefore, wood.felled)
    .flatMap((t) => (t.id === null ? [] : [t.id]));
  return last.slice(-1);
}
