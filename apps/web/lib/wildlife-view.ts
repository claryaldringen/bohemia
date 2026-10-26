// Divoká zvěř v pohledu na ves (docs/design/wildlife.md – Co hráč vidí): hrubé stavy druhů (tři
// stupně plnosti, žádné přesné kusy – Martin 24. 10. 2026 nechal na Claudovi, návrh Clauda), lov
// a psi dvorce, škoda zvěře na dílech polí a podklady upozornění. Čistý modul – jen čtení stavu
// vsi, žádný přepočet krajiny (pohled se počítá při každém dotazování).
import {
  FIELD_GUARD,
  HUNT,
  MANOR_DOGS,
  PREDATION,
  crowFlocks,
  dateOfDayIndex,
  dogsWanted,
  huntPool,
  lordFamily,
  villageHerds,
  wildlifeCaps,
  type VillageState,
  type WildlifeState,
} from '@bohemia/game';
import type { SceneWildShown, SceneWildlife } from './village-view-scene-types';

/** Druhy zvěře, které jde vybrat (klik na zvíře – W10) a ukázat v panelu. */
export type WildlifeSpecies = 'boar' | 'deer' | 'hare' | 'wolf' | 'bear' | 'fox' | 'fish';

/** Názvy druhů a ikony (`/icons/resources/<ikona>.png`). */
export const WILDLIFE_LABELS: Record<WildlifeSpecies, { name: string; icon: string }> = {
  boar: { name: 'Divoká prasata', icon: 'boar' },
  deer: { name: 'Jelení zvěř', icon: 'deer' },
  hare: { name: 'Zajíci', icon: 'hare' },
  wolf: { name: 'Vlci', icon: 'wolf' },
  bear: { name: 'Medvěd', icon: 'bear' },
  fox: { name: 'Lišky', icon: 'fox' },
  fish: { name: 'Ryby', icon: 'fish' },
};

/** Pořadí druhů v panelu. */
export const WILDLIFE_ORDER: readonly WildlifeSpecies[] = [
  'boar',
  'deer',
  'hare',
  'wolf',
  'bear',
  'fox',
  'fish',
];

/** Hrubý stav druhu: 0 – nikdo, 1–3 – málo, středně, hodně; `full` – nad stropem (plno). */
export type WildlifeLevel = 0 | 1 | 2 | 3;

/** Hrubý stav jednoho druhu pro panel – bez přesných počtů kusů. */
export interface WildlifeSpeciesView {
  species: WildlifeSpecies;
  level: WildlifeLevel;
  full: boolean;
  /** Kolik druhu kraj uživí (strop, celé číslo; ryby kg biomasy, medvěd 0/1). */
  capacity: number;
  /** Škoda na polích loni (kg obilí) – prasata a jelení zvěř; jinak null. */
  lastYearDamageKg: number | null;
  /** Dobytek strhnutý od 1. 5. (kusy) – vlci; jinak null. */
  killedHeads: number | null;
}

/** Zvěř vsi pro panel druhu a upozornění. */
export interface VillageWildlife {
  species: WildlifeSpeciesView[];
  /** Průměrná škoda zvěře na polích u lesa letos (podíl úrody 0–1, vážený plochou dílů). */
  damageShare: number;
  /** Šelmy strhly dobytek dvakrát a víckrát za posledních 30 dní. */
  wolvesTroubling: boolean;
  /** Smečka dvorce není nakrmená. */
  dogsUnfed: boolean;
}

/** Ikony úlovku letos (`/icons/resources/<ikona>.png`) s počtem kusů (ryby kg). */
export interface HuntCatch {
  icon: string;
  name: string;
  count: number;
}

/** Lov rodu a psi dvorce pro panel dvorce. */
export interface HuntView {
  catches: HuntCatch[];
  /** Maso z lovu, ryb a ok letos (kg, celé). */
  meatKg: number;
  /** Psi: kolik jich je, kolik jich dvorec chce, obilí za den (kg) a zda je ves krmí. */
  dogs: { count: number; wanted: number; grainKgPerDay: number; fed: boolean } | null;
}

/** Škoda zvěře na dílu pole pro panel dílu. */
export interface FieldDamageView {
  /** Škoda letos (celá procenta úrody dílu). */
  percent: number;
  kg: number;
  /** Vzdálenost dílu k okraji lesa (m). */
  edgeM: number;
  /** Díl se dnes hlídá (jezdecká hlídka se nepočítá – ta kryje celou ves). */
  watched: boolean;
}

const EPSILON = 1e-6;
/** Stupně plnosti: do ⅓ stropu málo, do ⅔ středně, výš hodně. */
const LEVEL_THIRDS: readonly [number, number] = [1 / 3, 2 / 3];

function levelOf(count: number, cap: number): { level: WildlifeLevel; full: boolean } {
  if (cap <= EPSILON || count <= EPSILON) return { level: 0, full: false };
  const ratio = count / cap;
  const level: WildlifeLevel = ratio <= LEVEL_THIRDS[0] ? 1 : ratio <= LEVEL_THIRDS[1] ? 2 : 3;
  return { level, full: ratio > 1 + EPSILON };
}

/** Celé kusy dobytka strhnuté šelmami od 1. 5. */
function killedHeadsOf(w: WildlifeState): number {
  const heads = w.predation?.yearHeads;
  if (!heads) return 0;
  return Math.round(heads.sheep + heads.goat + heads.pig + heads.cow);
}

/** Šelmy strhly aspoň `HUNT.wolfKills` kusů za posledních `PREDATION.killDaysKept` dní. */
function wolvesTroubling(w: WildlifeState, day: number): boolean {
  const since = day - PREDATION.killDaysKept;
  return (w.predation?.killDays ?? []).filter((d) => d > since).length >= HUNT.wolfKills;
}

/** Průměrná letošní škoda dílů u lesa (podíl úrody, vážený plochou dílů). */
function damageShareOf(state: VillageState, w: WildlifeState): number {
  const damage = w.damage;
  if (!damage || damage.risk.length === 0) return 0;
  const area = new Map(state.parts.map((p) => [p.id, p.areaM2]));
  let sum = 0;
  let total = 0;
  for (const r of damage.risk) {
    const m2 = area.get(r.partId) ?? 0;
    sum += (damage.parts[String(r.partId)]?.share ?? 0) * m2;
    total += m2;
  }
  return total > 0 ? sum / total : 0;
}

/** Hrubé stavy zvěře vsi; ves bez zvěře (starší než zvěř, ještě nepřevedená) null. */
export function wildlifeView(state: VillageState, day: number): VillageWildlife | null {
  const w = state.wildlife;
  if (!w) return null;
  const caps = wildlifeCaps(w.land, villageHerds(state).pig);
  const lastYear = w.damage?.lastYearKg;
  const counts: Record<WildlifeSpecies, { count: number; cap: number }> = {
    boar: { count: w.boar.adults + w.boar.piglets, cap: caps.boar },
    deer: { count: w.deer.stags + w.deer.hinds + w.deer.calves, cap: caps.deer },
    hare: { count: w.hares, cap: caps.hares },
    wolf: { count: w.wolves, cap: caps.wolves },
    bear: { count: w.bear.present ? 1 : 0, cap: caps.bear ? 1 : 0 },
    // lišky se neukládají – odvodí se z krajiny, vždy na stropu
    fox: { count: caps.foxes, cap: caps.foxes },
    fish: { count: w.fishKg, cap: caps.fishKg },
  };
  const species = WILDLIFE_ORDER.map((id): WildlifeSpeciesView => {
    const { count, cap } = counts[id];
    return {
      species: id,
      ...levelOf(count, cap),
      capacity: Math.round(cap),
      lastYearDamageKg: (id === 'boar' || id === 'deer') && lastYear ? Math.round(lastYear) : null,
      killedHeads: id === 'wolf' ? killedHeadsOf(w) : null,
    };
  });
  return {
    species,
    damageShare: damageShareOf(state, w),
    wolvesTroubling: wolvesTroubling(w, day),
    dogsUnfed: w.dogs !== undefined && Math.floor(w.dogs.count + EPSILON) >= 1 && !w.dogs.fed,
  };
}

/**
 * Kolik kusů ukázat ve scéně podle stupně stavu (0–3) – pár kusů, ne jedinci simulace
 * (wildlife.md – Ve scéně: jelení nejvýš 12, prasata 10 – jedna rota, zajíci 4, liška 1, vlci 5,
 * medvěd 1; mezistupně návrh Clauda).
 */
export const SCENE_WILD_SHOWN = {
  deer: [0, 4, 8, 12],
  boar: [0, 4, 7, 10],
  hare: [0, 1, 2, 4],
  wolf: [0, 2, 3, 5],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * Zvěř pro scénu: viditelné kusy podle stupňů (`wildlifeView`), díl s největší škodou, hejna
 * vran podle osetých ha (`sownHa`) a podíl ryb. Ves bez zvěře null.
 */
export function sceneWildlife(
  state: VillageState,
  day: number,
  sownHa: number,
): SceneWildlife | null {
  const w = state.wildlife;
  const view = wildlifeView(state, day);
  if (!w || !view) return null;
  const levelOf = (id: WildlifeSpecies): WildlifeLevel =>
    view.species.find((s) => s.species === id)?.level ?? 0;
  const caps = wildlifeCaps(w.land, villageHerds(state).pig);
  const top = w.damage?.topPartId ?? null;
  return {
    shown: sceneWildShown(w, {
      deer: levelOf('deer'),
      boar: levelOf('boar'),
      hare: levelOf('hare'),
      wolf: levelOf('wolf'),
      fox: levelOf('fox'),
    }),
    month: dateOfDayIndex(day).month,
    ...(top !== null ? { topPartId: top } : {}),
    crowFlocks: crowFlocks(sownHa),
    fishShare: caps.fishKg > EPSILON ? Math.min(1, Math.max(0, w.fishKg / caps.fishKg)) : 0,
  };
}

/** Viditelné kusy: počet podle stupně, rozdělený v poměru stavu (jeleni / laně / kolouši…). */
export function sceneWildShown(
  w: Pick<WildlifeState, 'deer' | 'boar' | 'bear'>,
  levels: Record<'deer' | 'boar' | 'hare' | 'wolf' | 'fox', WildlifeLevel>,
): SceneWildShown {
  const deer = SCENE_WILD_SHOWN.deer[levels.deer];
  const deerSum = w.deer.stags + w.deer.hinds + w.deer.calves;
  // jelen aspoň jeden, když nějaký je (stádo laní s kolouchy, jeleni zvlášť)
  const stags =
    deerSum > EPSILON && w.deer.stags > EPSILON
      ? Math.min(deer, Math.max(1, Math.round((deer * w.deer.stags) / deerSum)))
      : 0;
  const calves =
    deerSum > EPSILON ? Math.min(deer - stags, Math.round((deer * w.deer.calves) / deerSum)) : 0;
  const boar = SCENE_WILD_SHOWN.boar[levels.boar];
  const boarSum = w.boar.adults + w.boar.piglets;
  const piglets =
    boarSum > EPSILON ? Math.min(boar - 1, Math.round((boar * w.boar.piglets) / boarSum)) : 0;
  return {
    stags,
    hinds: deer - stags - calves,
    calves,
    boars: boar - Math.max(0, piglets),
    piglets: Math.max(0, piglets),
    hares: SCENE_WILD_SHOWN.hare[levels.hare],
    foxes: levels.fox > 0 ? 1 : 0,
    wolves: SCENE_WILD_SHOWN.wolf[levels.wolf],
    bears: w.bear.present ? 1 : 0,
  };
}

/** Lov rodu letos a psi dvorce; dvorec bez psů a bez úlovku null. */
export function huntView(state: VillageState, day: number): HuntView | null {
  const w = state.wildlife;
  if (!w) return null;
  const year = w.hunt?.year;
  const small = w.smallGame?.year;
  const catches: HuntCatch[] = [];
  const add = (icon: string, name: string, count: number): void => {
    if (count > 0) catches.push({ icon, name, count });
  };
  add('boar', 'Divoká prasata', year?.boar ?? 0);
  add('deer', 'Jelení zvěř', year?.deer ?? 0);
  add('wolf', 'Vlci', year?.wolves ?? 0);
  add('bear', 'Medvěd', year?.bear ?? 0);
  add('hare', 'Zajíci', Math.floor((small?.hares ?? 0) + EPSILON));
  add('fish', 'Ryby (kg)', Math.round(small?.fishKg ?? 0));
  const meatKg = Math.round((year?.meatKg ?? 0) + (small?.meatKg ?? 0));
  const dogs = w.dogs;
  const count = dogs ? Math.floor(dogs.count + EPSILON) : 0;
  if (catches.length === 0 && count < 1) return null;
  const wanted = dogsWanted(huntPool(state, day, lordFamily(state, day)));
  return {
    catches,
    meatKg,
    dogs:
      dogs && count >= 1
        ? {
            count,
            wanted,
            grainKgPerDay: Math.round(dogs.count * MANOR_DOGS.grainKgPerDay * 10) / 10,
            fed: dogs.fed,
          }
        : null,
  };
}

/**
 * Škoda zvěře letos po dílech (jen díly, které zvěř ohrožuje): procenta úrody, kg, vzdálenost
 * k lesu a zda se díl dnes hlídá (noční hlídka vesničanů, pokrytí dílu > 0). Mimo sezónu
 * (po 31. 8. se ohrožené díly vyprázdní) prázdná mapa.
 */
export function fieldDamageViews(state: VillageState, day: number): Map<number, FieldDamageView> {
  const result = new Map<number, FieldDamageView>();
  const damage = state.wildlife?.damage;
  if (!damage) return result;
  const watch = state.wildlife?.watch;
  const month = dateOfDayIndex(day).month;
  const nightOn =
    watch !== undefined &&
    month >= FIELD_GUARD.night.fromMonth &&
    month <= FIELD_GUARD.night.toMonth &&
    day >= watch.fromDay;
  for (const r of damage.risk) {
    const lost = damage.parts[String(r.partId)];
    const planned = nightOn ? watch?.parts.find((p) => p.partId === r.partId) : undefined;
    const adults = planned?.adult === true && watch?.adultDay === day ? (watch.adultFrac ?? 0) : 0;
    result.set(r.partId, {
      percent: Math.round((lost?.share ?? 0) * 100),
      kg: Math.round(lost?.kg ?? 0),
      edgeM: Math.round(r.edgeM),
      watched: planned !== undefined && planned.free + adults > EPSILON,
    });
  }
  return result;
}
