// Diagnostika správce (plán úloh správce 1. 11. 2026, úloha 0): roční záznam každé vsi rodu
// z kroků dopočtu `runDynasty` (`RunOptions.observe`) – lidé a věk, zásoby 1. 9., plán osevu
// proti sklizni, osev v červnu po plodinách, kapacita setí v oknech, práce po činnostech, stavby
// správce a jejich cena, režim, přelidnění a odchody. Hospodářský rok začíná 1. 9. (rok založení
// vsi = 0). Jen čte stav – výsledek běhu nemění. Bez I/O.
import { dateOfDayIndex } from '../../src/domain/calendar';
import {
  bufferFill,
  craftCoverage,
  fieldFoodShare,
  fieldTarget,
  isStewardBuilt,
  laborBudget,
  stewardMode,
  yearlyFoodNeed,
  type VillageState,
} from '../../src/domain/village';
import { fieldSowingTargets, sowingCapacity } from '../../src/domain/village/simulate-plan';
import { stewardOutlook, type StewardOutlook } from '../../src/domain/village/steward-outlook';
import { stewardCrowded, stewardFieldRoom } from '../../src/domain/village/steward-son';
import type { ChunkView } from './steward-measure';

const DAYS_PER_YEAR = 365.25;
/** Jen první krok měsíce (kroky dopočtu po 10 dnech). */
const FIRST_DAYS = 10;

/** Snímek 1. 9. (po žních, začátek hospodářského roku). */
export interface SeptemberView {
  people: number;
  adults: number;
  children: number;
  dwellings: number;
  storesKg: number;
  needYearKg: number;
  fieldShare: number;
  plannedKg: number;
  leftKg: number;
  bufferKg: number;
  /** Cíl polí v lidech – potřeba / uživí. */
  targetNeed: number;
  targetHave: number;
  laborLeft: number;
  ha: number;
  haFounding: number;
  walkM: number;
  crowded: boolean;
  fieldRoom: boolean;
  /** Kapacita setí (člověkodny): podzim ozimu, celý podzim, jaro; orba ano/ne. */
  capacity: { autumnWinter: number; autumn: number; spring: number; plough: boolean };
  tools: number;
  /** Výhled vsi (osev podle práce, osiva a půdy, hrdlo). */
  outlook: StewardOutlook;
}

export interface DiagYear {
  year: number;
  chunks: number;
  hungryChunks: number;
  mode: { emergency: number; recovery: number; growth: number };
  bufferSum: number;
  harvestKg: number;
  hungerDeaths: number;
  births: number;
  /** Práce po činnostech (člověkodny – vzorek posledního dne kroku × dny kroku). */
  labor: Record<string, number>;
  /** Cena staveb, které správce za rok začal, po druzích (člověkodny). */
  stewardBuilds: Record<string, number>;
  sep?: SeptemberView;
  /** Červen: oseto (ha) po plodinách a celkem. */
  june?: { haSown: number; crops: Record<string, number> };
  /** Odchody synů tento rok (lidé výpravy). */
  departures: number[];
}

export interface DiagVillage {
  index: number;
  foundYear: number;
  years: DiagYear[];
}

/** Sběr diagnostiky: `observe` do `RunOptions`, po běhu `villages`. */
export function stewardDiag(foundDay: number): {
  observe: (view: ChunkView) => void;
  villages: DiagVillage[];
} {
  const villages: DiagVillage[] = [];
  const seen = new Map<number, Set<number>>();
  const seenDepartures = new Map<number, Set<number>>();
  const yearOf = (v: DiagVillage, day: number): DiagYear => {
    const d = dateOfDayIndex(day);
    const year = d.year - dateOfDayIndex(foundDay).year - (d.month < 9 ? 1 : 0);
    let rec = v.years.find((r) => r.year === year);
    if (!rec) {
      rec = {
        year,
        chunks: 0,
        hungryChunks: 0,
        mode: { emergency: 0, recovery: 0, growth: 0 },
        bufferSum: 0,
        harvestKg: 0,
        hungerDeaths: 0,
        births: 0,
        labor: {},
        stewardBuilds: {},
        departures: [],
      };
      v.years.push(rec);
    }
    return rec;
  };
  const observe = (view: ChunkView): void => {
    let v = villages[view.index];
    if (!v) {
      v = {
        index: view.index,
        foundYear: Math.floor((view.foundDay - foundDay) / DAYS_PER_YEAR),
        years: [],
      };
      villages[view.index] = v;
    }
    const s = view.state;
    const r = yearOf(v, view.to);
    for (const e of view.chronicle) {
      if (e.kind === 'death' && e.cause === 'hunger') r.hungerDeaths++;
      else if (e.kind === 'birth') r.births++;
      else if (e.kind === 'harvest') r.harvestKg += e.kg;
    }
    r.chunks++;
    if (s.people.length === 0) return;
    if (s.hungry) r.hungryChunks++;
    const coverage = craftCoverage(s, view.to);
    r.mode[stewardMode(s, view.to, coverage)]++;
    const targets = fieldSowingTargets(s, view.to, coverage);
    r.bufferSum += bufferFill(targets);
    const days = view.to - view.from;
    for (const share of s.labor?.shares ?? []) {
      r.labor[share.activity] = (r.labor[share.activity] ?? 0) + share.manDays * days;
    }
    const built = seen.get(view.index) ?? new Set<number>();
    seen.set(view.index, built);
    for (const c of s.constructions) {
      if (built.has(c.id)) continue;
      built.add(c.id);
      if (!isStewardBuilt(s, c.id)) continue;
      const kind = c.kind === 'dwelling' && c.dwellingType ? `${c.kind}/${c.dwellingType}` : c.kind;
      r.stewardBuilds[kind] = Math.round((r.stewardBuilds[kind] ?? 0) + c.cost);
    }
    const left = seenDepartures.get(view.index) ?? new Set<number>();
    seenDepartures.set(view.index, left);
    for (const d of s.steward?.departures ?? []) {
      if (left.has(d.id)) continue;
      left.add(d.id);
      r.departures.push(d.settlers?.people.length ?? 0);
    }
    const date = dateOfDayIndex(view.to);
    if (date.day > FIRST_DAYS) return;
    if (date.month === 9) r.sep = september(view, s, coverage, targets);
    if (date.month === 6) r.june = june(s);
  };
  return { observe, villages };
}

function hectares(m2: number): number {
  return Math.round(m2 / 100) / 100;
}

function september(
  view: ChunkView,
  s: VillageState,
  coverage: ReturnType<typeof craftCoverage>,
  targets: ReturnType<typeof fieldSowingTargets>,
): SeptemberView {
  const day = view.to;
  const outlook = stewardOutlook(s, day, coverage);
  const target = fieldTarget(s, day, coverage, outlook);
  const inRotation = s.parts.filter((p) => p.state !== 'founding');
  const area = inRotation.reduce((sum, p) => sum + p.areaM2, 0);
  const walk = inRotation.reduce((sum, p) => sum + p.areaM2 * p.distanceM, 0);
  const capacity = sowingCapacity(s, day, coverage);
  const ages = s.people.map((p) => (day - p.bornDay) / DAYS_PER_YEAR);
  return {
    people: s.people.length,
    adults: ages.filter((a) => a >= 14).length,
    children: ages.filter((a) => a < 14).length,
    dwellings: s.dwellings.length,
    storesKg: Math.round(s.storesKg),
    needYearKg: Math.round(yearlyFoodNeed(s, day)),
    fieldShare: Math.round(fieldFoodShare(s) * 100) / 100,
    plannedKg: Math.round(targets.targetKg),
    leftKg: Math.round(targets.leftKg),
    bufferKg: Math.round(targets.bufferKg),
    targetNeed: Math.round(target.need * 10) / 10,
    targetHave: Math.round(target.have * 10) / 10,
    laborLeft: Math.round(laborBudget(s).left),
    ha: hectares(area),
    haFounding: hectares(
      s.parts.filter((p) => p.state === 'founding').reduce((sum, p) => sum + p.areaM2, 0),
    ),
    walkM: area > 0 ? Math.round(walk / area) : 0,
    crowded: stewardCrowded(s, day, coverage, outlook),
    fieldRoom: stewardFieldRoom(s, day, view.landscape, view.obstacles, outlook),
    capacity: {
      autumnWinter: Math.round(capacity.autumnWinter),
      autumn: Math.round(capacity.autumn),
      spring: Math.round(capacity.spring),
      plough: capacity.plough !== undefined,
    },
    tools: Math.round(coverage.tools * 100) / 100,
    outlook,
  };
}

function june(s: VillageState): { haSown: number; crops: Record<string, number> } {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  const crops: Record<string, number> = {};
  for (const c of s.season?.crops ?? []) {
    const key = `${c.crop}${c.surplus ? '+' : ''}`;
    const m2 = c.partIds.reduce((sum, id) => sum + (byId.get(id)?.areaM2 ?? 0), 0);
    crops[key] = hectares((crops[key] ?? 0) * 10_000 + m2);
  }
  const sown = s.parts.filter((p) => p.state === 'sown').reduce((sum, p) => sum + p.areaM2, 0);
  return { haSown: hectares(sown), crops };
}

/** Nejvyšší položky záznamu (`a:12 b:5`). */
function top(record: Record<string, number>, count = 6, digits = 0): string {
  return Object.entries(record)
    .sort((x, y) => y[1] - x[1])
    .slice(0, count)
    .map(([k, v]) => `${k}:${v.toFixed(digits)}`)
    .join(' ');
}

/** Roční řádky diagnostiky po vsích (výpis jako `brief.py` ze scratchpadu). */
export function formatDiag(villages: readonly DiagVillage[]): string {
  const lines: string[] = [];
  for (const v of villages) {
    lines.push(`--- ves ${v.index}${v.index === 0 ? ' (mateřská)' : ''} od roku ${v.foundYear}`);
    lines.push(
      ' rok lidé dosp  zásoby potřeba plán sklizeň  ha/oseto/zakl  chůze pojistka hlad† N/O/R  cíl potř/uživí  kapacita pod/jaro  výhled práce/osivo/půda ha hrdlo  přelid/kam  práce  stavby',
    );
    for (const y of v.years) {
      const s = y.sep;
      const field = ['reclaim', 'dig', 'sow', 'weed', 'harvest', 'carry', 'thresh', 'plough'];
      const fieldWork = field.reduce((sum, k) => sum + (y.labor[k] ?? 0), 0);
      lines.push(
        [
          String(y.year).padStart(3),
          s ? `${s.people} ${s.adults}` : '- -',
          s ? `${s.storesKg} ${s.needYearKg} ${s.plannedKg}` : '- - -',
          String(Math.round(y.harvestKg)),
          `${s?.ha ?? '-'}/${y.june?.haSown ?? '-'}/${s?.haFounding ?? '-'}`,
          `${s?.walkM ?? '-'}m`,
          (y.chunks > 0 ? y.bufferSum / y.chunks : 0).toFixed(2),
          `${y.hungryChunks}${y.hungerDeaths > 0 ? `†${y.hungerDeaths}` : ''}`,
          `${y.mode.emergency}/${y.mode.recovery}/${y.mode.growth}`,
          s ? `${s.targetNeed}/${s.targetHave}` : '-',
          s
            ? `${s.capacity.autumnWinter}/${s.capacity.spring}${s.capacity.plough ? 'P' : ''}`
            : '-',
          s
            ? `${s.outlook.laborHa.toFixed(1)}/${s.outlook.seedHa.toFixed(1)}/${s.outlook.landHa.toFixed(1)} ${s.outlook.bottleneck}`
            : '-',
          s ? `${s.crowded ? 1 : 0}${s.fieldRoom ? 1 : 0}` : '-',
          `pole ${Math.round(fieldWork)} založ ${Math.round(y.labor['found-field'] ?? 0)} vrac ${Math.round(y.labor['reclaim'] ?? 0)} kop ${Math.round(y.labor['dig'] ?? 0)} volno ${Math.round(y.labor['idle'] ?? 0)}`,
          `S[${top(y.stewardBuilds)}]`,
          y.june ? `osev[${top(y.june.crops, 6, 1)}]` : '',
          y.departures.length > 0 ? `ODCHOD ${y.departures.join(',')}` : '',
        ].join('  '),
      );
    }
  }
  return lines.join('\n');
}
