// Vzhled dílů pole ve scéně (fields.md – Co hráč vidí) – čisté funkce bez Babylonu. Herní jádro
// posílá po dílech, co je na nich vidět (`SceneFieldPart.look`, rozpracovaný díl s `work`
// a `before`); dokud to neposílá, odhadne se vzhled ze stadia dílu a data (odhad níž). Odtud
// bere vzhled kreslení polí (field-renderer.ts) i postavy (villager-plan.ts) – oba tak vidí
// stejný rozpracovaný čtverec.
import type { FieldLook, LaborActivity, SceneFieldPart, SceneVillage } from '../village-view';
import { aftermathGrazing, hayPhase } from './hay-meadows';

export type { FieldLook };

/** Všechny vzhledy dílu v pořadí roku – vývojové stránky je ukazují po řadě. */
export const FIELD_LOOKS: readonly FieldLook[] = [
  'bare',
  'plowed',
  'sown',
  'sprouted',
  'green',
  'ripe',
  'harvesting',
  'stubble',
  'young-fallow',
  'pasture',
  'meadow',
  'mown',
  'haystacks',
];

/** Názvy vzhledů pro vývojové stránky. */
export const FIELD_LOOK_LABELS: Record<FieldLook, string> = {
  bare: 'rozrytý drn',
  plowed: 'zorané pole',
  sown: 'oseto',
  sprouted: 'vzchází obilí',
  green: 'zelené obilí',
  ripe: 'zralé obilí',
  harvesting: 'žeň – panáky',
  stubble: 'strniště',
  'young-fallow': 'mladý úhor – pase se',
  pasture: 'spasená pastvina',
  meadow: 'úhor – louka, roste tráva',
  mown: 'úhor – posečeno na seno',
  haystacks: 'úhor – stohy sena',
};

/**
 * Díl s rozhodnutým vzhledem pro kreslení a postavy: vzhled (null = zakládaný díl, na kterém
 * se ještě nepracovalo – jen kolíky), rozpracovanost (podíl hotových řádků, null = celý díl),
 * vzhled zbytku (null = povrch před prací) a pořadí v práci (fronta od vsi).
 */
export interface PartView {
  part: SceneFieldPart;
  look: FieldLook | null;
  work: number | null;
  before: FieldLook | null;
  /** Díl je vytyčený – zakládá se a ještě není hotový (kolíky a provázek po obrysu). */
  staked: boolean;
  /** Pořadí dílu v práci na poli (0 = první, od obydlí). */
  order: number;
}

/** Kolik řádků (pruhů napříč dílem) se zobrazí jako hotových – po krocích sítě obtisku. */
export const WORK_STEPS = 8;

// Dny v roce (nepřestupný rok, 1. 1. = 1) – okna prací podle fields.md (Práce).
const DAY = {
  mar1: 60,
  may1: 121,
  jun1: 152,
  jul1: 182,
  sep1: 244,
  dec1: 335,
} as const;
/** Kolik kopání se stihne na podzim (zbytek v březnu a dubnu – fields.md, Práce). */
const AUTUMN_DIG_SHARE = 0.6;
/** Za kolik dní po setí obilí vzejde a za kolik je zelené (dny). */
const SPROUT_DAYS = 16;
const GREEN_DAYS = 40;
/** Jak dlouho stojí panáky na strništi po žni (dny), než se odvezou. */
const STOOK_DAYS = 12;

/** Den v roce z herního dne (index) – 1. 1. = 1. */
export function dayOfYearFromDate(month: number, day: number): number {
  const before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return (before[month - 1] ?? 0) + day;
}

/**
 * Střed vsi pro směr práce na poli: obydlí, ve kterých se bydlí, jinak všechna obydlí
 * a staveniště (jako postavy – villager-plan.ts), bez obydlí střed pole.
 */
export function villageCenter(
  village: Pick<SceneVillage, 'dwellings'>,
  fallback: readonly { x: number; z: number }[] = [],
): { x: number; z: number } {
  const homes = village.dwellings.filter((d) => d.built && d.inhabited !== false);
  const list =
    homes.length > 0
      ? homes.map((d) => d.position)
      : village.dwellings.length > 0
        ? village.dwellings.map((d) => d.position)
        : fallback;
  if (list.length === 0) return { x: 0, z: 0 };
  return {
    x: list.reduce((s, p) => s + p.x, 0) / list.length,
    z: list.reduce((s, p) => s + p.z, 0) / list.length,
  };
}

/**
 * Souřadnice práce na dílu: řádky vedou podél `along` (podél delší strany pole), práce postupuje
 * napříč řádky ve směru `across` – od strany blíž vsi pryč. `w` bodu je 0 u strany, kde práce
 * začíná, a 1 u protější strany dílu.
 */
export interface WorkFrame {
  along: [number, number];
  across: [number, number];
  half: number;
}

export function workFrame(
  part: { x: number; z: number; size: number },
  rows: readonly [number, number],
  center: { x: number; z: number },
): WorkFrame {
  const [dx, dz] = rows;
  // napříč řádky; práce jde od vsi pryč (na stejné ose jako u vsi nejbližší řádek)
  let nx = -dz;
  let nz = dx;
  if ((part.x - center.x) * nx + (part.z - center.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { along: [dx, dz], across: [nx, nz], half: part.size / 2 };
}

/** Podíl `w` bodu na dílu (0 = strana, kde práce začíná). */
export function workAt(
  frame: WorkFrame,
  part: { x: number; z: number },
  x: number,
  z: number,
): number {
  const v = (x - part.x) * frame.across[0] + (z - part.z) * frame.across[1];
  return (v + frame.half) / (2 * frame.half);
}

/** Rozpracovanost zaokrouhlená na hotové pruhy (WORK_STEPS na díl). */
export function workSteps(work: number): number {
  return Math.min(1, Math.max(0, Math.round(work * WORK_STEPS) / WORK_STEPS));
}

/**
 * Díly pole v pořadí práce: od nejbližšího k obydlí (jako zakládání v herním jádru), při shodě
 * podle polohy. Bez obydlí od středu vsi.
 */
export function workOrder(
  parts: readonly SceneFieldPart[],
  village: Pick<SceneVillage, 'dwellings'>,
  center: { x: number; z: number },
): SceneFieldPart[] {
  const houses = village.dwellings.map((d) => d.position);
  const distance = (p: SceneFieldPart): number =>
    houses.length > 0
      ? Math.min(...houses.map((h) => Math.hypot(h.x - p.x, h.z - p.z)))
      : Math.hypot(center.x - p.x, center.z - p.z);
  return [...parts].sort((a, b) => distance(a) - distance(b) || a.x - b.x || a.z - b.z);
}

/** Kontext odhadu: den v roce (1–366) a ves (obydlí určí pořadí a směr práce). */
export interface LookContext {
  dayOfYear: number;
  village: Pick<SceneVillage, 'dwellings'>;
}

/**
 * Vzhled všech dílů pole – v pořadí `field.parts`. Díl s `look` od herního jádra se kreslí
 * podle něj, ostatní podle odhadu ze stadia a data (`estimatePart`).
 */
export function fieldPartViews(
  field: { parts: readonly SceneFieldPart[] },
  context: LookContext,
): PartView[] {
  const center = villageCenter(context.village, field.parts);
  const ordered = workOrder(field.parts, context.village, center);
  const order = new Map(ordered.map((p, i) => [p, i]));
  // odhad postupuje po dílech oseté části pole (v plánu) a louky na seno v pořadí práce
  const sown = ordered.filter((p) => p.stage === 'sown');
  const sownIndex = new Map(sown.map((p, i) => [p, i]));
  const hay = ordered.filter((p) => isHayStage(p.stage));
  const hayIndex = new Map(hay.map((p, i) => [p, i]));
  return field.parts.map((part) => {
    const index = order.get(part) ?? 0;
    if (part.look) {
      if (part.work !== undefined && part.work <= 0) {
        // na dílu se ještě nepracovalo – vidět je jen stav před prací (zakládaný: kolíky)
        const staked = part.stage === 'founding';
        return { part, look: part.before ?? null, work: null, before: null, staked, order: index };
      }
      const work = part.work !== undefined && part.work < 1 ? part.work : null;
      return {
        part,
        look: part.look,
        work,
        before: work !== null ? (part.before ?? null) : null,
        staked: part.stage === 'founding' && (part.work ?? 0) < 1,
        order: index,
      };
    }
    const estimate = isHayStage(part.stage)
      ? estimatePart(part, context.dayOfYear, hayIndex.get(part) ?? 0, hay.length)
      : estimatePart(part, context.dayOfYear, sownIndex.get(part) ?? 0, sown.length);
    return { ...estimate, part, order: index };
  });
}

/**
 * Odhad vzhledu dílu ze stadia a data (dokud herní jádro vzhled neposílá). Oseté díly (v plánu)
 * prochází rokem po řadě – `index` z `count` v pořadí práce: na podzim se kope (60 %), v březnu
 * a dubnu dokope a zaseje, obilí vzejde, zezelená, v červenci dozraje a v červenci a srpnu se
 * žne po čtvercích (panáky stojí ještě pár dní).
 */
export function estimatePart(
  part: SceneFieldPart,
  dayOfYear: number,
  index: number,
  count: number,
): Omit<PartView, 'part' | 'order'> {
  const whole = (look: FieldLook): Omit<PartView, 'part' | 'order'> => ({
    look,
    work: null,
    before: null,
    staked: false,
  });
  switch (part.stage) {
    case 'founding': {
      const work = part.work ?? 0;
      if (work <= 0) return { look: null, work: null, before: null, staked: true };
      return { look: 'bare', work: work < 1 ? work : null, before: null, staked: work < 1 };
    }
    case 'ready':
      return whole('bare');
    case 'young-fallow':
      // mladý úhor (strniště 1–2 roky) se pase – stáda s pasáčkem (Martin)
      return whole('young-fallow');
    case 'meadow':
    case 'young-growth':
    case 'shrub':
    case 'forest':
      // starší úhor nezarůstá křovím ani lesem – je z něj louka, která se kosí na seno (Martin)
      return estimateHay(dayOfYear, index, Math.max(1, count));
    case 'sown':
      return estimateSown(dayOfYear, index, Math.max(1, count));
  }
}

/** Stadium úhoru, ve kterém je louka na seno (starší než mladý úhor). */
export function isHayStage(stage: SceneFieldPart['stage']): boolean {
  return stage === 'meadow' || stage === 'young-growth' || stage === 'shrub' || stage === 'forest';
}

/**
 * Louka na seno po dílech: na jaře vysoká tráva, v červnu se seče po dílech od vsi (posečené
 * pruhy přibývají), pak seno v kupkách a od poloviny července stohy na otavě – ty přes podzim
 * a zimu mizí (hay-meadows.ts).
 */
function estimateHay(day: number, index: number, count: number): Omit<PartView, 'part' | 'order'> {
  const phase = hayPhase(day);
  if (!phase) return { look: 'meadow', work: null, before: null, staked: false };
  if (phase.hay === 'stacks') return { look: 'haystacks', work: null, before: null, staked: false };
  return frontier(index, phase.mown * count, 'mown', 'meadow');
}

/** Podíl okna `from`–`to` (dny v roce), které uplynulo v den `day` (0–1). */
function through(day: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (day - from) / (to - from)));
}

/**
 * Fronta práce: díl `index` z `count`, když je hotová část `done` (0–count dílů) – hotový díl
 * má vzhled `after`, rozpracovaný oba, ostatní `before`.
 */
function frontier(
  index: number,
  done: number,
  after: FieldLook,
  before: FieldLook,
): Omit<PartView, 'part' | 'order'> {
  if (index < Math.floor(done)) return { look: after, work: null, before: null, staked: false };
  if (index === Math.floor(done) && done - index > 0) {
    return { look: after, work: done - index, before, staked: false };
  }
  return { look: before, work: null, before: null, staked: false };
}

function estimateSown(day: number, index: number, count: number): Omit<PartView, 'part' | 'order'> {
  // podzim: kope se (strniště → zoráno), 60 % do konce listopadu
  if (day >= DAY.sep1 && day < DAY.dec1) {
    const dug = through(day, DAY.sep1, DAY.dec1) * AUTUMN_DIG_SHARE * count;
    return frontier(index, dug, 'plowed', 'stubble');
  }
  // zima: zorané a nezorané díly čekají na jaro
  if (day >= DAY.dec1 || day < DAY.mar1) {
    return frontier(index, AUTUMN_DIG_SHARE * count, 'plowed', 'stubble');
  }
  // březen a duben: dokopává se a seje po dílech (setí jde za kopáním)
  if (day < DAY.may1) {
    const t = through(day, DAY.mar1, DAY.may1);
    const sown = t * count;
    if (index < Math.ceil(sown)) {
      const sownDay = DAY.mar1 + ((index + 0.5) / count) * (DAY.may1 - DAY.mar1);
      if (index < Math.floor(sown) && day - sownDay > SPROUT_DAYS) {
        return { look: 'sprouted', work: null, before: null, staked: false };
      }
      return frontier(index, sown, 'sown', 'plowed');
    }
    const dug = (AUTUMN_DIG_SHARE + (1 - AUTUMN_DIG_SHARE) * Math.min(1, t * 1.6)) * count;
    return frontier(index, dug, 'plowed', 'stubble');
  }
  // květen a červen: vzchází a zelená (díly zaseté dřív jsou napřed)
  if (day < DAY.jul1) {
    const sownDay = DAY.mar1 + ((index + 0.5) / count) * (DAY.may1 - DAY.mar1);
    return {
      look: day - sownDay > GREEN_DAYS ? 'green' : 'sprouted',
      work: null,
      before: null,
      staked: false,
    };
  }
  // červenec a srpen: zralé obilí se žne po čtvercích, panáky stojí ještě pár dní
  if (day < DAY.sep1) {
    const reaped = through(day, DAY.jul1, DAY.sep1) * count;
    const state = frontier(index, reaped, 'harvesting', 'ripe');
    if (state.look === 'harvesting' && state.work === null) {
      const reapedDay = DAY.jul1 + ((index + 1) / count) * (DAY.sep1 - DAY.jul1);
      if (day - reapedDay > STOOK_DAYS) return { ...state, look: 'stubble' };
    }
    return state;
  }
  return { look: 'stubble', work: null, before: null, staked: false };
}

/**
 * Na kterých dílech dnes pracuje polní práce `activity`: díly z fronty práce od herního jádra
 * (`parts` – id), jinak odhad: nejdřív rozpracovaný díl úlohy, pak díly, na které práce přijde
 * (v pořadí práce). Pletí jde po zelených dílech, zakládání po zakládaných.
 */
export function workedParts(
  views: readonly PartView[],
  activity: LaborActivity,
  ids?: readonly number[],
): PartView[] {
  if (ids && ids.length > 0) {
    const byId = new Map(views.flatMap((v) => (v.part.id === undefined ? [] : [[v.part.id, v]])));
    const listed = ids.flatMap((id) => {
      const view = byId.get(id);
      return view ? [view] : [];
    });
    if (listed.length > 0) return listed;
  }
  const task = TASK_LOOKS[activity];
  if (!task) return [];
  const byOrder = [...views].sort((a, b) => a.order - b.order);
  const active = byOrder.filter((v) => v.work !== null && task.after.includes(v.look));
  const queued = byOrder.filter((v) => v.work === null && task.queued(v));
  const list = [...active, ...queued];
  return list.length > 0 ? list : byOrder.filter((v) => task.fallback(v));
}

/** Polní práce → vzhled hotové části, díly ve frontě a kde pracovat, když fronta není znát. */
const TASK_LOOKS: Partial<
  Record<
    LaborActivity,
    {
      after: readonly (FieldLook | null)[];
      queued(view: PartView): boolean;
      fallback(view: PartView): boolean;
    }
  >
> = {
  'found-field': {
    after: ['bare'],
    queued: (v) => v.staked,
    fallback: (v) => v.part.stage === 'founding',
  },
  dig: {
    after: ['plowed'],
    queued: (v) => v.part.stage === 'sown' && (v.look === 'stubble' || v.look === 'bare'),
    fallback: (v) => v.part.stage === 'sown' || v.part.stage === 'ready',
  },
  reclaim: {
    after: ['plowed'],
    queued: (v) => v.part.stage === 'sown' && (v.look === 'stubble' || v.look === 'pasture'),
    fallback: (v) => v.part.stage === 'sown',
  },
  sow: {
    after: ['sown'],
    queued: (v) => v.part.stage === 'sown' && v.look === 'plowed',
    fallback: (v) => v.part.stage === 'sown',
  },
  weed: {
    after: [],
    queued: (v) => v.look === 'sprouted' || v.look === 'green',
    fallback: (v) => v.part.stage === 'sown',
  },
  harvest: {
    after: ['harvesting'],
    queued: (v) => v.look === 'ripe',
    fallback: (v) => v.part.stage === 'sown',
  },
  carry: {
    after: ['harvesting'],
    queued: (v) => v.look === 'harvesting',
    fallback: (v) => v.part.stage === 'sown',
  },
};

/**
 * Díl se pase – stáda smějí na něj (livestock-placement.ts): mladý úhor a pastvina vždy, louka
 * na seno až po seči na otavě (od srpna do konce listopadu – Martin: ne dřív). Bez dne v roce
 * se louka na seno nepase.
 */
export function grazeablePart(
  part: Pick<SceneFieldPart, 'stage' | 'look' | 'work'>,
  dayOfYear?: number,
): boolean {
  const aftermath = dayOfYear !== undefined && aftermathGrazing(dayOfYear);
  if (part.look) {
    if (part.work !== undefined && part.work < 1) return false;
    if (part.look === 'pasture' || part.look === 'young-fallow') return true;
    return part.look === 'haystacks' && aftermath;
  }
  if (part.stage === 'young-fallow') return true;
  return isHayStage(part.stage) && aftermath;
}
