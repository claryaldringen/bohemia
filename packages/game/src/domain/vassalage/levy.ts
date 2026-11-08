import { stoneOf, type MacroBundle } from './macro';

// Roční Odvody (vassalage.md – Roční dialog 1. 11.): svazek `MacroBundle` jako ploché řádky pro
// porovnání „domluveno × odvedeno“, zápis do kroniky a rozdělení po vsích.

/** Řádky Odvodů – jeden na druh zboží (dobytek po druzích, lidé po skupinách). */
export const LEVY_GOODS = [
  'grainKg',
  'hayKg',
  'cows',
  'youngOxen',
  'trainedOxen',
  'horses',
  'logs',
  'stoneM3',
  'families',
  'men',
  'women',
  'laborDays',
] as const;

export type LevyGood = (typeof LEVY_GOODS)[number];

/** Odvedené (nebo domluvené) množství po řádcích. */
export type LevyAmounts = Record<LevyGood, number>;

/** Jeden řádek odpovědi vazala: kolik celkem (přes všechny vsi) odvádí z daného zboží. */
export interface LevyAnswerLine {
  good: LevyGood;
  amount: number;
}

/** Řádek Odvodů pro kroniku a upozornění: odvedeno z domluveného. */
export interface LevyPart {
  good: LevyGood;
  sent: number;
  agreed: number;
}

/** Svazek rozložený na ploché řádky. */
export function flattenBundle(b: MacroBundle): LevyAmounts {
  return {
    grainKg: b.grainKg,
    hayKg: b.hayKg,
    cows: b.cattle.cows,
    youngOxen: b.cattle.youngOxen,
    trainedOxen: b.cattle.trainedOxen,
    horses: b.horses,
    logs: b.logs,
    stoneM3: stoneOf(b),
    families: b.people.families,
    men: b.people.men,
    women: b.people.women,
    laborDays: b.laborDays,
  };
}

/** Ploché řádky zpět na svazek. */
export function bundleOfAmounts(a: LevyAmounts): MacroBundle {
  return {
    grainKg: a.grainKg,
    hayKg: a.hayKg,
    cattle: { cows: a.cows, youngOxen: a.youngOxen, trainedOxen: a.trainedOxen },
    horses: a.horses,
    logs: a.logs,
    stoneM3: a.stoneM3 ?? 0,
    people: { families: a.families, men: a.men, women: a.women },
    laborDays: a.laborDays,
  };
}

/** Svazek vynásobený počtem let (dialog, který čekal víc let, žádá víc roků naráz). */
export function scaleBundle(b: MacroBundle, factor: number): MacroBundle {
  const a = flattenBundle(b);
  const out = noAmountsFlat();
  for (const good of LEVY_GOODS) out[good] = a[good] * factor;
  return bundleOfAmounts(out);
}

function noAmountsFlat(): LevyAmounts {
  const out = {} as LevyAmounts;
  for (const good of LEVY_GOODS) out[good] = 0;
  return out;
}

/** Součet svazků po řádcích. */
export function sumBundles(bundles: readonly MacroBundle[]): LevyAmounts {
  const out = noAmountsFlat();
  for (const b of bundles) {
    const a = flattenBundle(b);
    for (const good of LEVY_GOODS) out[good] += a[good];
  }
  return out;
}

/** Je svazek prázdný (nic neposílá)? */
export function isEmptyBundle(b: MacroBundle): boolean {
  const a = flattenBundle(b);
  return LEVY_GOODS.every((good) => a[good] === 0);
}

/**
 * Předvyplněné rozdělení po vsích (vassalage.md – Roční dialog): každého zboží se z `agreed`
 * rozdělí podle přebytku vsí (`spare`) – poměrně, bez překročení přebytku; co přebytek nepokryje,
 * dostane ves s největším přebytkem tohoto zboží. Celá čísla; součet vždy dá `agreed`.
 */
export function suggestSplit(
  agreed: MacroBundle,
  villages: readonly { id: string; spare: MacroBundle }[],
): Record<string, MacroBundle> {
  const want = flattenBundle(agreed);
  const result = new Map<string, LevyAmounts>(villages.map((v) => [v.id, noAmountsFlat()]));
  if (villages.length === 0) return {};
  const spares = new Map(villages.map((v) => [v.id, flattenBundle(v.spare)]));
  for (const good of LEVY_GOODS) {
    let left = want[good];
    if (left <= 0) continue;
    const integer = good !== 'grainKg' && good !== 'hayKg';
    const total = villages.reduce((s, v) => s + spares.get(v.id)![good], 0);
    if (total > 0) {
      const take = Math.min(left, total);
      let given = 0;
      for (const v of villages) {
        const share = (take * spares.get(v.id)![good]) / total;
        const part = integer ? Math.floor(share) : Math.floor(share * 10) / 10;
        result.get(v.id)![good] = part;
        given += part;
      }
      left -= given;
      // zbytek po zaokrouhlení po jednom kusu vsím s ještě volným přebytkem
      const step = integer ? 1 : 0.1;
      for (const v of villages) {
        const cur = result.get(v.id)!;
        const room = spares.get(v.id)![good] - cur[good];
        const add = Math.min(left, Math.max(0, Math.floor(room / step + 1e-9) * step));
        if (add > 0) {
          cur[good] = Math.round((cur[good] + add) * 10) / 10;
          left = Math.round((left - add) * 10) / 10;
        }
      }
    }
    if (left > 1e-9) {
      // přebytek nestačí – zbytek první (největší přebytek) vsi, vazal ho smí upravit
      const first = [...villages].sort(
        (a, b) => spares.get(b.id)![good] - spares.get(a.id)![good],
      )[0]!;
      const cur = result.get(first.id)!;
      cur[good] = Math.round((cur[good] + left) * 10) / 10;
    }
  }
  return Object.fromEntries([...result].map(([id, a]) => [id, bundleOfAmounts(a)]));
}
