import type { FieldPreview } from '@bohemia/game';

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

/** Tvar podstatného jména podle celého čísla: 1 / 2–4 / 0 a 5+. */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.round(count));
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
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

/** Popisek náhledu pole při kreslení: výměra louky, průměrná úrodnost a cena založení. */
export function fieldPreviewLabel(preview: Omit<FieldPreview, 'parts' | 'check'>): string {
  return [
    formatHa(preview.areaM2),
    `úrodnost ${Math.round(preview.averageFertility)}`,
    formatManDays(preview.foundingCost),
  ].join(' · ');
}
