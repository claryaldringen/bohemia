// Popisky výhledu osetého dílu a pole (fields.md – Co hráč vidí, Očekávaná úroda a jestli práce
// stačí): z čeho je očekávaná úroda a na co práce do konce okna nestačí. Čísla počítá jádro
// (`fieldOutlook`), tady jsou jen slova do `Tooltip`.

import { monthGenitive } from './game-date';
import { formatInteger, formatManDays } from './village-format';
import type { FieldOutlookView, PartOutlookView, WorkShortfallView } from './village-view-types';

/** Krátké názvy plodin do popisků. */
const CROP_SHORT: Record<PartOutlookView['crop'], string> = {
  winter: 'ozim',
  spring: 'jař',
  legume: 'luštěniny',
  flax: 'len',
};

/** Co úrodu mění – pořadí a názvy v popisku. */
const EFFECTS = [
  ['weather', 'počasí'],
  ['wildlife', 'zvěř'],
  ['disasters', 'kroupy, voda a smršť'],
  ['work', 'nedodělaná práce'],
] as const;

/** Změna úrody v procentech – ubírá „−20 %“, přidá „+10 %“. */
function effectText(percent: number): string {
  return percent > 0 ? `−${percent} %` : `+${-percent} %`;
}

/**
 * Popisek očekávané úrody dílu: plodina, úroda z úrodnosti a co ji mění (počasí, které už je
 * vidět, zvěř, kroupy, voda a smršť, nedodělaná práce po konci okna).
 */
export function outlookYieldLabel(o: PartOutlookView): string {
  const effects = EFFECTS.flatMap(([key, name]) => {
    const value = o[key];
    return value !== undefined && value !== 0 ? [`${name} ${effectText(value)}`] : [];
  });
  return [
    `Očekávaná úroda – ${CROP_SHORT[o.crop]} (kg): z úrodnosti ${formatInteger(o.fullKg)}`,
    ...effects,
  ].join('; ');
}

/** Kroky okna slovy – „příprava a setí“, „setí“, „sklizeň“. */
const STEP_NAMES: Record<WorkShortfallView['steps'][number], string> = {
  prep: 'příprava',
  sow: 'setí',
  harvest: 'sklizeň',
};

/** Jedno okno, na které práce nestačí: „příprava a setí do konce dubna – chybí 40 člověkodnů“. */
function shortfallText(s: WorkShortfallView): string {
  const steps = s.steps.map((x) => STEP_NAMES[x]);
  const what = steps.length > 1 ? `${steps.slice(0, -1).join(', ')} a ${steps.at(-1)}` : steps[0];
  const missing = [
    ...(s.manDays ? [formatManDays(s.manDays)] : []),
    ...(s.ploughManDays ? [`orba ${formatManDays(s.ploughManDays)}`] : []),
  ].join(', ');
  return `${what} do konce ${monthGenitive(s.endMonth)} – chybí ${missing}`;
}

/** Popisek varování: práce do konce okna nestačí (u dílu i pole). */
export function shortfallLabel(short: readonly WorkShortfallView[]): string {
  return `Práce nestačí: ${short.map(shortfallText).join('; ')}`;
}

/** Nejvíc chybějící práce z oken (číslo u ikony varování). */
export function shortfallManDays(short: readonly WorkShortfallView[]): number {
  return Math.max(0, ...short.map((s) => (s.manDays ?? 0) + (s.ploughManDays ?? 0)));
}

/** Popisek očekávané úrody pole – po plodinách, len zvlášť (třený len, ne jídlo). */
export function fieldOutlookLabel(o: FieldOutlookView): string {
  const food = o.crops.filter((c) => c.crop !== 'flax');
  const flax = o.crops.find((c) => c.crop === 'flax');
  const crops = food.map((c) => `${CROP_SHORT[c.crop]} ${formatInteger(c.kg)}`).join(', ');
  const linen = flax ? `len ${formatInteger(flax.kg)} třeného` : '';
  return `Očekávaná úroda pole (kg): ${[crops, linen].filter((x) => x !== '').join('; ')}`;
}

/** Úroda jídla z pole celkem (kg) – obilí a luštěniny, bez lnu. */
export function fieldOutlookKg(o: FieldOutlookView): number {
  return o.crops.reduce((sum, c) => sum + (c.crop === 'flax' ? 0 : c.kg), 0);
}
