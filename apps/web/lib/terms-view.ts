// Podmínky vazalství jako ikony s čísly (docs/design/vassalage.md – Co hráč vidí): z dávky,
// odměny, služby a cílové vsi složí řádky „ikona + číslo + popisek“ pro panel i jednání. Čistý
// modul – smí do prohlížeče.
import { linesOfTerms } from '@bohemia/game';
import type {
  AidLine,
  HungerLevel,
  MacroBundle,
  MacroGoods,
  TermItem,
  TermLine,
  VassalTerms,
} from '@bohemia/game';
import { plural } from './village-format';

/** Ikona: vlastní kresba rodu (`house/…svg`) nebo ikona zdroje (`resources/….png`). */
export interface TermIcon {
  set: 'house' | 'resources';
  name: string;
}

export type BundleKey =
  | 'grainKg'
  | 'hayKg'
  | 'cows'
  | 'youngOxen'
  | 'trainedOxen'
  | 'horses'
  | 'logs'
  | 'men'
  | 'women'
  | 'families'
  | 'laborDays';

/** Jedno políčko svazku (dávky, odměny): klíč do formuláře, ikona, jednotka a popisek. */
export interface BundleSlot {
  key: BundleKey;
  icon: TermIcon;
  /** Jednotka u čísla: „kg“ u obilí a sena, jinak prázdná. */
  unit: string;
  /** Popisek do `Tooltip`: „Obilí“. */
  label: string;
}

/** Všechna políčka svazku v pevném pořadí (formulář i zobrazení). */
export const BUNDLE_SLOTS: readonly BundleSlot[] = [
  { key: 'grainKg', icon: { set: 'house', name: 'grain' }, unit: 'kg', label: 'Obilí' },
  { key: 'hayKg', icon: { set: 'resources', name: 'hay' }, unit: 'kg', label: 'Seno' },
  { key: 'cows', icon: { set: 'resources', name: 'cow' }, unit: '', label: 'Krávy' },
  { key: 'youngOxen', icon: { set: 'resources', name: 'young-ox' }, unit: '', label: 'Mladí voli' },
  { key: 'trainedOxen', icon: { set: 'resources', name: 'ox' }, unit: '', label: 'Vycvičení voli' },
  { key: 'horses', icon: { set: 'resources', name: 'horse' }, unit: '', label: 'Koně' },
  { key: 'logs', icon: { set: 'house', name: 'log' }, unit: '', label: 'Klády' },
  { key: 'men', icon: { set: 'resources', name: 'man' }, unit: '', label: 'Muži' },
  { key: 'women', icon: { set: 'resources', name: 'woman' }, unit: '', label: 'Ženy' },
  { key: 'families', icon: { set: 'resources', name: 'family' }, unit: '', label: 'Rodiny' },
  { key: 'laborDays', icon: { set: 'resources', name: 'labor' }, unit: '', label: 'Robota (dny)' },
];

/** Hodnota políčka ve svazku. */
export function bundleValue(bundle: MacroBundle, key: BundleKey): number {
  switch (key) {
    case 'grainKg':
    case 'hayKg':
    case 'horses':
    case 'logs':
    case 'laborDays':
      return bundle[key];
    case 'cows':
    case 'youngOxen':
    case 'trainedOxen':
      return bundle.cattle[key];
    case 'men':
    case 'women':
    case 'families':
      return bundle.people[key];
  }
}

/** Svazek s upravenou hodnotou políčka (vstup se nemění). */
export function withBundleValue(bundle: MacroBundle, key: BundleKey, value: number): MacroBundle {
  switch (key) {
    case 'grainKg':
    case 'hayKg':
    case 'horses':
    case 'logs':
    case 'laborDays':
      return { ...bundle, [key]: value };
    case 'cows':
    case 'youngOxen':
    case 'trainedOxen':
      return { ...bundle, cattle: { ...bundle.cattle, [key]: value } };
    case 'men':
    case 'women':
    case 'families':
      return { ...bundle, people: { ...bundle.people, [key]: value } };
  }
}

/** Prázdný svazek (nový řádek dávky nebo odměny). */
export function emptyBundle(): MacroBundle {
  return {
    grainKg: 0,
    hayKg: 0,
    cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
    horses: 0,
    logs: 0,
    people: { families: 0, men: 0, women: 0 },
    laborDays: 0,
  };
}

/** Čísla s pevnou mezerou po tisících: 12 500. */
export function formatAmount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Políčka svazku, která nejsou nulová (co se ukáže jako ikony s čísly). */
export function bundleEntries(bundle: MacroBundle): { slot: BundleSlot; value: number }[] {
  return BUNDLE_SLOTS.map((slot) => ({ slot, value: bundleValue(bundle, slot.key) })).filter(
    (e) => e.value > 0,
  );
}

/** Ikona s číslem a popiskem – jedno políčko řádku podmínek. */
export interface TermChip {
  key: string;
  icon: TermIcon;
  /** Číslo (nebo „3 × 30“ u služby). */
  text: string;
  /** Popisek do `Tooltip`: „Dávka: obilí 500 kg“. */
  label: string;
  /** Odměna pána vazalovi – ikona se kreslí slabší. */
  reward?: boolean;
}

function bundleChips(prefix: 'tribute' | 'reward', title: string, bundle: MacroBundle): TermChip[] {
  return bundleEntries(bundle).map(({ slot, value }) => ({
    key: `${prefix}-${slot.key}`,
    icon: slot.icon,
    text: formatAmount(value),
    label: `${title}: ${slot.label.toLowerCase()} ${formatAmount(value)}${slot.unit ? ` ${slot.unit}` : ''}`,
    ...(prefix === 'reward' ? { reward: true } : {}),
  }));
}

/** Popisek služby: „3 muži na 30 dní“. */
export function serviceLabel(men: number, days: number): string {
  return `${men} ${plural(men, 'muž', 'muži', 'mužů')} na ${days} ${plural(days, 'den', 'dny', 'dní')}`;
}

/** Ikony s čísly jedné podmínky; `villageName` je jméno cílové vsi, když ho známe. */
export function lineChips(line: TermLine, villageName?: string | null): TermChip[] {
  switch (line.kind) {
    case 'tribute':
      return bundleChips('tribute', 'Dávka', line.goods);
    case 'reward':
      return bundleChips('reward', 'Odměna', line.goods);
    case 'service':
      return [
        {
          key: 'service',
          icon: { set: 'house', name: 'sword' },
          text: `${line.men} × ${line.days}`,
          label: `Vojenská služba: ${serviceLabel(line.men, line.days)}`,
        },
      ];
    case 'target-village':
      return [
        {
          key: 'target-village',
          icon: { set: 'house', name: 'village-key' },
          text: '',
          label: villageName ? `Správa vsi ${villageName}` : 'Cílová ves',
        },
      ];
  }
}

/** Políčka pomoci a splátek: jen zboží (lidé a robota se nepůjčují). */
export const GOODS_SLOTS: readonly BundleSlot[] = BUNDLE_SLOTS.filter(
  (slot) => !['men', 'women', 'families', 'laborDays'].includes(slot.key),
);

/** Ikona druhu pomoci (vlastní kresby rodu). */
export const AID_ICONS: Record<AidLine['kind'], TermIcon> = {
  'aid-request': { set: 'house', name: 'aid' },
  gift: { set: 'house', name: 'gift' },
  loan: { set: 'house', name: 'loan' },
};

const AID_TITLES: Record<AidLine['kind'], string> = {
  'aid-request': 'Žádost o pomoc',
  gift: 'Dar',
  loan: 'Půjčka',
};

/** Svazek zboží (bez lidí a roboty) jako ikony s čísly: `key` předpona, `title` do popisku. */
function goodsChips(key: string, title: string, goods: MacroGoods): TermChip[] {
  return GOODS_SLOTS.map((slot) => ({
    slot,
    value: bundleValue(
      { ...goods, people: { families: 0, men: 0, women: 0 }, laborDays: 0 },
      slot.key,
    ),
  }))
    .filter((e) => e.value > 0)
    .map(({ slot, value }) => ({
      key: `${key}-${slot.key}`,
      icon: slot.icon,
      text: formatAmount(value),
      label: `${title}: ${slot.label.toLowerCase()} ${formatAmount(value)}${slot.unit ? ` ${slot.unit}` : ''}`,
    }));
}

/** Ikony s čísly řádku pomoci; půjčka za svazkem ukáže splátky (rok a zboží). */
export function aidChips(line: AidLine): TermChip[] {
  const chips: TermChip[] = [...goodsChips(line.kind, AID_TITLES[line.kind], line.bundle)];
  if (line.kind === 'loan') {
    for (const [i, installment] of line.schedule.entries()) {
      chips.push({
        key: `loan-year-${i}`,
        icon: { set: 'house', name: 'hourglass' },
        text: String(installment.year),
        label: `Splátka v roce ${installment.year}`,
        reward: true,
      });
      chips.push(...goodsChips(`loan-${i}`, `Splátka ${installment.year}`, installment.goods));
    }
  }
  return chips;
}

/** Ikony s čísly všech podmínek dohody (panel pánů a vazalů). */
export function termChips(
  terms: VassalTerms,
  villageName?: (id: string) => string | null,
): TermChip[] {
  return linesOfTerms(terms).flatMap((line) =>
    lineChips(
      line,
      line.kind === 'target-village' ? (villageName?.(line.villageId) ?? null) : null,
    ),
  );
}

/** Řádky podmínek dohody jako položky jednání (bez přísahy) – základ formuláře Nové podmínky. */
export function termItemsOf(terms: VassalTerms): TermItem[] {
  return linesOfTerms(terms);
}

/** Popisek hladu, který se hráči ukáže; sytý rod ikonu nemá (null). */
export function hungerLabel(level: HungerLevel | null): string | null {
  switch (level) {
    case 'rationing':
      return 'Šetří jídlem';
    case 'hungry':
      return 'Hladoví';
    case 'starving':
      return 'Lidé umírají hlady';
    default:
      return null;
  }
}

/** Popisek počtu neplnění u zlomené pečeti; 0 = bez pečeti (null). */
export function breachLabel(breaches: number): string | null {
  return breaches > 0
    ? `Neplnění: ${breaches} ${plural(breaches, 'případ', 'případy', 'případů')}`
    : null;
}
