import { fallowStage, type FallowRank } from '../fields/fields';
import type { FallowStage } from '../types';
import { fallowPrepPerHa, type PrepWorkPerHa } from './year-plan';

// Pořadí odpočatých přílohů do osevu podle toho, co vsi chybí (fields.md – Pořadí dávek; Martin
// 22. 11. 2026: „Obecně se drž pravidla vyprodukovat co nejvíce za co nejmenší množství práce.“).

const EPSILON = 1e-9;

/** Stadia přílohu (fields.md – Zarůstání). */
const FALLOW_STAGES: readonly FallowStage[] = ['young-fallow', 'meadow', 'shrubs', 'young-forest'];

/**
 * Kolik hektarů stadia čelo práce ještě vezme (fields.md – Pořadí dávek): volné místo u lidí
 * a u spřežení (`free`, člověkodny; přeplněné čelo jako bez místa) za cenu hektaru stadia – dojde
 * dřív to místo, kterému stadium dá míň hektarů. Bez orby (motyka) jen lidé.
 */
export function stageHectares(free: PrepWorkPerHa, price: PrepWorkPerHa): number {
  const people = price.people > 0 ? Math.max(0, free.people) / price.people : Infinity;
  const plough = price.plough > 0 ? Math.max(0, free.plough) / price.plough : Infinity;
  return Math.min(people, plough);
}

/**
 * Pořadí stadií přílohu (0 první): napřed stadium, kterého čelo vezme nejvíc hektarů
 * (`stageHectares` za ceny `fallowPrepPerHa`) – nejlevnější na tom, co vsi chybí. Když chybí
 * spřežení, s rádlem napřed mladý příloh, křoví a mladý les, louka (drn se orá křížem) až po nich;
 * když chybí lidé, napřed mladý příloh a louka, pak křoví a mladý les. Shoda se láme cenou hektaru
 * u lidí, pak u spřežení (stadia omezená týmž místem tak rozhodne druhý zdroj); stadia se stejnými
 * hektary i cenami mají stejné pořadí – rozhodnou dnešní klíče bloků.
 */
export function fallowRanks(
  free: PrepWorkPerHa,
  toolCoverage: number,
  plough: boolean,
): Readonly<Record<FallowStage, number>> {
  const keys = FALLOW_STAGES.map((stage): readonly number[] => {
    const price = fallowPrepPerHa(stage, toolCoverage, plough);
    return [-stageHectares(free, price), price.people, price.plough];
  });
  const compare = (a: readonly number[], b: readonly number[]): number => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!;
      const y = b[i]!;
      if (x === y || Math.abs(x - y) <= EPSILON) continue;
      return x < y ? -1 : 1;
    }
    return 0;
  };
  const ranks = {} as Record<FallowStage, number>;
  FALLOW_STAGES.forEach((stage, i) => {
    // pořadí = kolik různých klíčů je menších
    const smaller: (readonly number[])[] = [];
    for (const k of keys) {
      if (compare(k, keys[i]!) < 0 && !smaller.some((s) => compare(s, k) === 0)) smaller.push(k);
    }
    ranks[stage] = smaller.length;
  });
  return ranks;
}

/**
 * Pořadí stadia odpočatého přílohu do osevu v den výběru `day` (`fallowRanks`) podle volného
 * místa na čele v okamžiku výběru (`free`). Místo i pořadí stadií se zjistí až u prvního přílohu
 * – bez přílohů ve výběru se nepočítají.
 */
export function fallowOrder(
  day: number,
  toolCoverage: number,
  plough: boolean,
  free: () => PrepWorkPerHa,
): FallowRank {
  let ranks: Readonly<Record<FallowStage, number>> | null = null;
  return (part) => {
    ranks ??= fallowRanks(free(), toolCoverage, plough);
    return ranks[fallowStage(part, day)];
  };
}
