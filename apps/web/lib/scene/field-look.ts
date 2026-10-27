// Vzhled dílů pole ve scéně (fields.md – Co hráč vidí) – čisté funkce bez Babylonu. Herní jádro
// posílá po dílech, co je na nich vidět (`SceneFieldPart.look`, rozpracovaný díl s `work`
// a `before`); dokud to neposílá, odhadne se vzhled ze stadia dílu a data (odhad níž). Odtud
// bere vzhled kreslení polí (field-renderer.ts) i postavy (villager-plan.ts) – oba tak vidí
// stejný rozpracovaný čtverec.
import { rotationCosSin } from '@bohemia/game';
import type { FieldLook, LaborActivity, SceneFieldPart, SceneVillage } from '../village-view';
import type { Rgb } from './field-crops';
import { aftermathGrazing, hayPhase } from './hay-meadows';
import { track, weatherAmounts, type Track } from './season-look';
import { hailWeight } from './storm';

export type { FieldLook };

/**
 * Všechny vzhledy dílu v pořadí roku – vývojové stránky je ukazují po řadě. Zarůstající příloh
 * (`shrubs`, `young-forest` – fields.md, Zarůstání) do roku nepatří, jeho vzhled dělají keře
 * a stromky podle let bez pastvy a seče (ukázka „Zarůstání“ na /dev/landscape).
 */
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
  shrubs: 'nepasený příloh – křoviny',
  'young-forest': 'nepasený příloh – mladý les',
  slash: 'klučení – paseka s větvemi',
  burnt: 'klučení – spálenina',
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
  /**
   * Na posečeném dílu (`mown`) leží řádky sena – je čerstvě posečený, seno ještě schne (díl dnešní
   * seče nebo rozpracovaný, v odhadu posečený před méně než SWATH_DAYS dny). Ostatní posečené díly
   * mají seno shrabané v kupkách. Bez údaje ne.
   */
  swaths?: boolean;
  /**
   * Násobek barvy dílu v suchu podle ochrany dílu (`droughtPartTint`) a na vymrzlém ozimu; bez
   * údaje beze změny.
   */
  tint?: Rgb;
  /** Obilí podle počasí roku (`partWeather`); bez údaje beze změny. */
  weather?: PartWeather;
}

/**
 * Obilí osetého dílu podle počasí roku (disasters.md – Ve scéně): v suchu nižší a řidší, v
 * deštivém létě před žněmi polehlé, po holomrazu řídký ozim s prosvítající hlínou.
 */
export interface PartWeather {
  /** Násobek výšky trsů (a porostu shora) 0–1. */
  height: number;
  /** Násobek hustoty trsů 0–1. */
  density: number;
  /** Podíl polehlého zralého obilí 0–1 (ve skvrnách). */
  lodged: number;
  /** Vymrzlá místa 0–1 – trsy chybí ve skvrnách a prosvítá hlína. */
  bare: number;
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
  part: {
    x: number;
    z: number;
    size: number;
    rotation?: number;
    furrow?: SceneFieldPart['furrow'];
  },
  rows: readonly [number, number],
  center: { x: number; z: number },
): WorkFrame {
  // díl, který orá spřežení: řady podél brázdy, práce napříč ve směru orby od herního jádra
  // (oxen.md – Co nejdelší brázda); osy mřížky pole jako `gridFrame` (natočený čtverec)
  if (part.furrow) {
    const [c, s] = part.rotation ? rotationCosSin(part.rotation) : [1, 0];
    const ax: [number, number] = [c, -s];
    const ay: [number, number] = [s, c];
    const along = part.furrow.axis === 'x' ? ax : ay;
    const perp = part.furrow.axis === 'x' ? ay : ax;
    const sweep = part.furrow.sweep;
    return { along, across: [perp[0] * sweep, perp[1] * sweep], half: part.size / 2 };
  }
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
  // vzdálenost dílu jednou (ne při každém porovnání řazení) – pořadí stejné
  const distances = new Map<SceneFieldPart, number>();
  for (const p of parts) {
    let distance = houses.length > 0 ? Infinity : Math.hypot(center.x - p.x, center.z - p.z);
    for (const h of houses) distance = Math.min(distance, Math.hypot(h.x - p.x, h.z - p.z));
    distances.set(p, distance);
  }
  return [...parts].sort((a, b) => distances.get(a)! - distances.get(b)! || a.x - b.x || a.z - b.z);
}

/**
 * Kontext odhadu: den v roce (1–366) a ves (obydlí určí pořadí a směr práce, rozdělení práce dne
 * díly dnešní seče – řádky sena).
 */
export interface LookContext {
  dayOfYear: number;
  village: Pick<SceneVillage, 'dwellings'> &
    Partial<Pick<SceneVillage, 'labor' | 'weather' | 'hail'>>;
}

/**
 * Vzhled všech dílů pole – v pořadí `field.parts`. Díl s `look` od herního jádra se kreslí
 * podle něj, ostatní podle odhadu ze stadia a data (`estimatePart`).
 */
export function fieldPartViews(
  field: { parts: readonly SceneFieldPart[] },
  context: LookContext,
): PartView[] {
  // stejné díly, obydlí a den (pole a postavy v jednom stavu vsi) – vzhled z mezipaměti
  const cached = viewsCache.get(field.parts);
  if (
    cached &&
    cached.dwellings === context.village.dwellings &&
    cached.labor === context.village.labor &&
    cached.weather === context.village.weather &&
    cached.hail === context.village.hail &&
    cached.day === context.dayOfYear
  ) {
    return cached.views;
  }
  const views = withHail(withWeather(computePartViews(field, context), context), context);
  viewsCache.set(field.parts, {
    dwellings: context.village.dwellings,
    labor: context.village.labor,
    weather: context.village.weather,
    hail: context.village.hail,
    day: context.dayOfYear,
    views,
  });
  return views;
}

/** Vzhled dílů podle pole (pole dílů ze stavu vsi) – výsledek se nemění, jen se čte. */
const viewsCache = new WeakMap<
  readonly SceneFieldPart[],
  {
    dwellings: LookContext['village']['dwellings'];
    labor: LookContext['village']['labor'];
    weather: LookContext['village']['weather'];
    hail: LookContext['village']['hail'];
    day: number;
    views: PartView[];
  }
>();

/** Barva dílu v plném suchu bez ochrany – žloutne a hnědne (disasters.md – Ve scéně, Sucho). */
const DRY_PART: Rgb = [1.12, 0.94, 0.66];
/** Barva dílu s plnou ochranou (za stromy) v plném suchu – zelenější. */
const SHELTERED_PART: Rgb = [0.97, 1.04, 0.95];
/** Sucho po čtvrtinách – díly se kvůli náběhu sucha přestaví nejvýš čtyřikrát. */
const DROUGHT_STEPS = 4;

/**
 * Násobek barvy dílu v suchu (disasters.md – Ve scéně, Sucho: „chráněné díly za stromy zůstávají
 * zelenější“): `drought` 0–1 (`SeasonLook.drought`, po čtvrtinách), `level` ochrana dílu 0–4
 * (`SceneWeather.parts`). Bez sucha null – barva beze změny.
 */
export function droughtPartTint(drought: number, level: number): Rgb | null {
  const stage = Math.round(Math.min(1, Math.max(0, drought)) * DROUGHT_STEPS) / DROUGHT_STEPS;
  if (stage === 0) return null;
  const sheltered = Math.min(4, Math.max(0, level)) / 4;
  const dry = stage * (1 - sheltered);
  const green = stage * sheltered;
  const channel = (i: 0 | 1 | 2): number =>
    (1 + (DRY_PART[i] - 1) * dry) * (1 + (SHELTERED_PART[i] - 1) * green);
  return [channel(0), channel(1), channel(2)];
}

/** Ve plném suchu bez ochrany: obilí o 35 % nižší a o 40 % řidší; plná ochrana z toho ubere 70 %. */
const DROUGHT_HEIGHT = 0.35;
const DROUGHT_DENSITY = 0.4;
const SHELTER_EFFECT = 0.7;
/** Polehlé obilí v plném mokru na nejhorším dílu (niva); ochrana 4 (svah) z toho ubere 60 %. */
const WET_LODGED = 0.6;
const WET_SHELTER_EFFECT = 0.6;
/** Holomráz: vymrzne třetina ozimu (disasters.md – Holomráz, ozim × 0,65). */
const FROST_LOSS = 0.35;
/** Vymrzlý ozim žloutne (místy – barva celého dílu jen trochu). */
const FROST_PART: Rgb = [1.06, 1, 0.84];
/**
 * Vymrzlý ozim: od 1. 2. (holomráz je vidět) za 5 dní, drží do žní; osev ozimu na podzim je už
 * nový ozim (díly v září bez stopy).
 */
const FROST_THIN: Track = [
  [32, 0],
  [37, 1],
  [240, 1],
  [244, 0],
];

/** Hodnota 0–1 po čtvrtinách – díly se kvůli náběhu počasí přestaví nejvýš čtyřikrát. */
function stepped(amount: number): number {
  return Math.round(Math.min(1, Math.max(0, amount)) * DROUGHT_STEPS) / DROUGHT_STEPS;
}

/**
 * Obilí osetého dílu podle počasí v den roku: `drought` a `wet` (`weatherAmounts`), `frost`
 * vymrzlý ozim 0–1, `level` ochrana dílu 0–4 proti odhalenému létu. Bez počasí null.
 */
export function partWeather(
  amounts: { drought: number; wet: number; frost: number },
  level: number,
  grain: boolean,
): PartWeather | null {
  const sheltered = Math.min(4, Math.max(0, level)) / 4;
  const dry = stepped(amounts.drought) * (1 - SHELTER_EFFECT * sheltered);
  const wet = grain ? stepped(amounts.wet) * WET_LODGED * (1 - WET_SHELTER_EFFECT * sheltered) : 0;
  const frost = stepped(amounts.frost) * FROST_LOSS;
  if (dry === 0 && wet === 0 && frost === 0) return null;
  return {
    height: 1 - DROUGHT_HEIGHT * dry,
    density: (1 - DROUGHT_DENSITY * dry) * (1 - frost),
    lodged: wet,
    bare: frost / FROST_LOSS,
  };
}

/** Násobek barvy vymrzlého ozimu (`bare` 0–1); bez vymrzání null. */
function frostTint(bare: number): Rgb | null {
  if (bare === 0) return null;
  return [
    1 + (FROST_PART[0] - 1) * bare,
    1 + (FROST_PART[1] - 1) * bare,
    1 + (FROST_PART[2] - 1) * bare,
  ];
}

/**
 * Díly podle počasí roku (disasters.md – Ve scéně): v suchu barva podle síly sucha a ochrany
 * dílu – díl za stromy zůstane zelenější; obilí osetých dílů nižší a řidší, v deštivém létě
 * polehlé, po holomrazu řídký žloutnoucí ozim. Bez počasí díly beze změny.
 */
function withWeather(views: PartView[], context: LookContext): PartView[] {
  const weather = context.village.weather;
  if (!weather) return views;
  const amounts = weatherAmounts(context.dayOfYear, weather);
  const frozen = weather.winter === 'blackFrost' ? track(FROST_THIN, context.dayOfYear) : 0;
  if (amounts.drought === 0 && amounts.wet === 0 && frozen === 0) return views;
  return views.map((view) => {
    const id = view.part.id;
    const level = id === undefined ? 0 : (weather.parts?.[String(id)] ?? 0);
    const dryTint = amounts.drought > 0 ? droughtPartTint(amounts.drought, level) : null;
    const sown = view.part.stage === 'sown';
    const frost = sown && view.part.winter ? frozen : 0;
    const crops = sown
      ? partWeather({ ...amounts, frost }, level, view.part.crop === undefined)
      : null;
    const tint = mergeTint(dryTint, crops ? frostTint(crops.bare) : null);
    if (!tint && !crops) return view;
    return { ...view, ...(tint ? { tint } : {}), ...(crops ? { weather: crops } : {}) };
  });
}

/**
 * Potlučené obilí v pruhu krupobití (disasters.md – Kroupy, Ve scéně) při plné síle (vnitřek
 * pruhu; okraj polovina): nižší a řidší, zralé obilí polehlé, otlučené listy hnědnou. Platí do
 * žní – sklizený díl už osetý není.
 */
const HAIL_CROPS = { height: 0.45, density: 0.5, tint: [0.86, 0.8, 0.66] as Rgb };

function withHail(views: PartView[], context: LookContext): PartView[] {
  const hail = context.village.hail;
  if (!hail) return views;
  return views.map((view) => {
    if (view.part.stage !== 'sown') return view;
    const w = hailWeight(hail.strip, view.part.x, view.part.z);
    if (w === 0) return view;
    const base = view.weather ?? { height: 1, density: 1, lodged: 0, bare: 0 };
    const grain = view.part.crop === undefined;
    const weather: PartWeather = {
      height: base.height * (1 - HAIL_CROPS.height * w),
      density: base.density * (1 - HAIL_CROPS.density * w),
      lodged: grain ? Math.max(base.lodged, w) : base.lodged,
      bare: base.bare,
    };
    const battered: Rgb = [
      1 + (HAIL_CROPS.tint[0] - 1) * w,
      1 + (HAIL_CROPS.tint[1] - 1) * w,
      1 + (HAIL_CROPS.tint[2] - 1) * w,
    ];
    return { ...view, weather, tint: mergeTint(view.tint ?? null, battered)! };
  });
}

function mergeTint(a: Rgb | null, b: Rgb | null): Rgb | null {
  if (!a || !b) return a ?? b;
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

/**
 * Díly dnešní seče z rozdělení práce (`mow` – díly polí podle id, přirozené louky podle políčka):
 * na nich leží řádky sena.
 */
function mownToday(village: LookContext['village']): (part: SceneFieldPart) => boolean {
  const ids = new Set<number>();
  const cells = new Set<string>();
  for (const share of village.labor?.shares ?? []) {
    if (share.activity !== 'mow') continue;
    const target = share.target;
    if (target.kind === 'field') for (const id of target.parts ?? []) ids.add(id);
    else if (target.kind === 'meadow') for (const c of target.cells) cells.add(`${c.x},${c.y}`);
  }
  return (part) =>
    (part.id !== undefined && ids.has(part.id)) || cells.has(`${part.cell.x},${part.cell.y}`);
}

function computePartViews(
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
  const fresh = mownToday(context.village);
  return field.parts.map((part) => {
    const index = order.get(part) ?? 0;
    if (part.look) {
      if (part.work !== undefined && part.work <= 0) {
        // na dílu se ještě nepracovalo – vidět je jen stav před prací (zakládaný: kolíky)
        const staked = part.stage === 'founding';
        return { part, look: part.before ?? null, work: null, before: null, staked, order: index };
      }
      const work = part.work !== undefined && part.work < 1 ? part.work : null;
      // řádky sena na rozpracovaném dílu a dílech dnešní seče, jinde shrabáno do kupek
      const swaths = part.look === 'mown' && (work !== null || fresh(part));
      return {
        part,
        look: part.look,
        work,
        before: work !== null ? (part.before ?? null) : null,
        staked: part.stage === 'founding' && (part.work ?? 0) < 1,
        order: index,
        ...(swaths ? { swaths: true } : {}),
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
      // starší úhor je louka, která se kosí na seno (Martin); nepasený a nesečený zarůstá
      return estimateHay(dayOfYear, index, Math.max(1, count));
    case 'sown':
      return estimateSown(dayOfYear, index, Math.max(1, count));
    case 'shrubs':
    case 'young-forest':
      // nepasený a nesečený příloh zarůstá (fields.md – Zarůstání)
      return whole(part.stage);
  }
}

/** Stadium úhoru, ve kterém je louka na seno (starší než mladý úhor). */
export function isHayStage(stage: SceneFieldPart['stage']): boolean {
  return stage === 'meadow';
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
  const view = frontier(index, phase.mown * count, 'mown', 'meadow');
  // seno posečené před méně než SWATH_DAYS dny leží v řádcích, starší je v kupkách
  const swaths = view.look === 'mown' && index + 1 > Math.floor(phase.raked * count);
  return swaths ? { ...view, swaths: true } : view;
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
  // seč sena na úhoru ve fázi louky (oxen.md – Seno)
  mow: {
    after: ['mown'],
    queued: (v) => v.look === 'meadow',
    fallback: (v) => isHayStage(v.part.stage),
  },
  // orba rádlem (oxen.md) – díly jako u kopání
  plough: {
    after: ['plowed'],
    queued: (v) => v.part.stage === 'sown' && (v.look === 'stubble' || v.look === 'bare'),
    fallback: (v) => v.part.stage === 'sown' || v.part.stage === 'ready',
  },
};

/**
 * Díl se pase – stáda smějí na něj (livestock-placement.ts): mladý úhor a pastvina vždy, louka
 * na seno až po seči na otavě (od srpna do konce listopadu – Martin: ne dřív). Bez dne v roce
 * se louka na seno nepase. Jen díly, kam stáda dojdou (`grazed` – nejbližší příloh napřed,
 * fields.md – Zarůstání); křoviny a mladý les nikdy.
 */
export function grazeablePart(
  part: Pick<SceneFieldPart, 'stage' | 'look' | 'work' | 'grazed'>,
  dayOfYear?: number,
): boolean {
  if (part.grazed === false || part.stage === 'shrubs' || part.stage === 'young-forest') {
    return false;
  }
  const aftermath = dayOfYear !== undefined && aftermathGrazing(dayOfYear);
  if (part.look) {
    if (part.work !== undefined && part.work < 1) return false;
    if (part.look === 'pasture' || part.look === 'young-fallow') return true;
    return part.look === 'haystacks' && aftermath;
  }
  if (part.stage === 'young-fallow') return true;
  return isHayStage(part.stage) && aftermath;
}
