import type { FieldPreview, HerdSpecies } from '@bohemia/game';

// Čísla a jednotky vsi česky pro panel, nabídku staveb a bublinu umisťování. Čistý modul –
// stejný výstup na serveru i v prohlížeči (mezery po tisících bez nezlomitelných mezer).

const M2_PER_HA = 10_000;

/** Celé číslo s mezerami po tisících. */
export function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Číslo s desetinnou čárkou. */
export function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/**
 * Cena v mincích – pod 10 dvě platné číslice („0,13“, „0,88“, „1,0“, „4,2“; i 0,999 a 1,04 jsou
 * „1,0“), od 10 celé číslo („120“, „1 200“).
 */
export function formatCoinPrice(price: number): string {
  const text = price.toPrecision(2);
  if (price >= 10 || text.includes('e')) return formatInteger(price);
  return text.replace('.', ',');
}

/** Tvar podstatného jména podle celého čísla: 1 / 2–4 / 0 a 5+. */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.round(count));
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Tvary druhů dobytka ve 4. pádě (koho) – 1 / 2–4 / 5+. */
const HERD_ACCUSATIVE: Record<HerdSpecies, readonly [string, string, string]> = {
  pig: ['prase', 'prasata', 'prasat'],
  goat: ['kozu', 'kozy', 'koz'],
  cow: ['krávu', 'krávy', 'krav'],
  sheep: ['ovci', 'ovce', 'ovcí'],
};
/** Pořadí druhů ve výčtu – jako nouzová porážka (prasata první). */
const HERD_LIST_ORDER: readonly HerdSpecies[] = ['pig', 'goat', 'cow', 'sheep'];

/**
 * Výčet kusů dobytka ve 4. pádě – „12 prasat a 3 kozy“; kusy se zaokrouhlí, druh pod půl kusu
 * vypadne. Bez kusů prázdný řetězec.
 */
export function formatAnimals(animals: Partial<Record<HerdSpecies, number>>): string {
  const items = HERD_LIST_ORDER.flatMap((species) => {
    const count = Math.round(animals[species] ?? 0);
    if (count <= 0) return [];
    const [one, few, many] = HERD_ACCUSATIVE[species];
    return [`${formatInteger(count)} ${plural(count, one, few, many)}`];
  });
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} a ${items.at(-1)!}`;
}

/** Výměra v hektarech na dvě desetinná místa – „0,42 ha“. */
export function formatHa(areaM2: number): string {
  return `${formatDecimal(areaM2 / M2_PER_HA, 2)} ha`;
}

/** Cena práce – „1 člověkoden“, „3 člověkodny“, „60 člověkodnů“. */
export function formatManDays(value: number): string {
  const rounded = Math.round(value);
  return `${formatInteger(rounded)} ${plural(rounded, 'člověkoden', 'člověkodny', 'člověkodnů')}`;
}

/** Podíl 0–1 jako celá procenta – „85 %“. */
export function formatPercent(share: number): string {
  return `${Math.round(Math.min(1, Math.max(0, share)) * 100)} %`;
}

/** Na kolik měsíců vystačí zásoby – dolů na celé měsíce, „na 17 měsíců“, „méně než měsíc“. */
export function formatStoresMonths(months: number): string {
  const whole = Math.floor(Math.max(0, months));
  if (whole === 0) return 'méně než na měsíc';
  return `na ${formatInteger(whole)} ${plural(whole, 'měsíc', 'měsíce', 'měsíců')}`;
}

/** Práce za den s jedním desetinným místem – „2,6 člověkodne za den“. */
export function formatLaborPerDay(manDays: number): string {
  return `${formatDecimal(Math.max(0, manDays), 1)} člověkodne za den`;
}

/** Počet čtverců pole – „1 čtverec“, „3 čtverce“, „12 čtverců“. */
export function formatCells(count: number): string {
  return `${formatInteger(count)} ${plural(count, 'čtverec', 'čtverce', 'čtverců')}`;
}

/** Popisek náhledu pole: počet čtverců, výměra louky, průměrná úrodnost a cena založení. */
export function fieldPreviewLabel(
  preview: Pick<FieldPreview, 'cells' | 'areaM2' | 'averageFertility' | 'foundingCost'>,
): string {
  return [
    formatCells(preview.cells.length),
    formatHa(preview.areaM2),
    `úrodnost ${Math.round(preview.averageFertility)}`,
    formatManDays(preview.foundingCost),
  ].join(' · ');
}

/**
 * Na kolik let místo vystačí – krátce pro panel výběru: „~12“, „<1“, „>100“, plno „0“, bez
 * odhadu (žádná úmrtí) „–“.
 */
export function formatYearsShort(years: number | null): string {
  if (years === null) return '–';
  if (years <= 0) return '0';
  if (years < 1) return '<1';
  if (years > 100) return '>100';
  return `~${formatInteger(years)}`;
}
