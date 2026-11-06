import { CATTLE_GOODS } from '../village/neighbours';
import { TRADE_GOOD_VALUES } from '../village/rules-trade';
import { addMacro, noMacroGoods, type MacroBundle, type MacroGoods } from './macro';
import { VASSALAGE } from './rules-vassalage';
import { checkBundle } from './terms';

// Pomoc na žádost, dar a půjčka (vassalage.md – Pomoc na žádost; Martin 2. 11. 2026: „Hmotná pomoc
// může být poskytnuta buď nezištně nebo jako půjčka se splátkovým kalendářem, která může být
// splacena i jiným zbožím, než tím, které vazal obdržel.“). Čistá pravidla: hodnota splátek,
// zbývající dluh a kontrola čísel řádků jednání.

/** Jedna splátka kalendáře: v herním roce `year` (1. 11.) a v jakém zboží. */
export interface LoanInstallment {
  year: number;
  goods: MacroGoods;
}

/**
 * Řádky jednání o pomoci (strany jsou rody): `aid-request` posílá vazal pánovi (co a kam),
 * `gift` a `loan` odpovídá pán – `fromVillageId` je ves, ze které zboží pošle (doveze ten, kdo
 * posílá), `toVillageId` volitelně kam (jinak ves hlavy rodu příjemce).
 */
export type AidLine =
  | { kind: 'aid-request'; bundle: MacroBundle; villageId: string }
  | { kind: 'gift'; bundle: MacroBundle; fromVillageId: string; toVillageId?: string }
  | {
      kind: 'loan';
      bundle: MacroBundle;
      fromVillageId: string;
      toVillageId?: string;
      schedule: LoanInstallment[];
    };

export const AID_KINDS = ['aid-request', 'gift', 'loan'] as const;

/** Je řádek řádkem o pomoci (ne přísaha ani podmínka vazalství)? */
export function isAidLine(item: { kind: string }): item is AidLine {
  return (AID_KINDS as readonly string[]).includes(item.kind);
}

export const AID_REASONS = {
  badBundle: 'Pomoc smí být jen obilí, seno, dobytek, koně a klády.',
  badSchedule: 'Splátkový kalendář musí mít roky po sobě rostoucí a zboží v mezích.',
  mixed: 'Jednání o pomoci nesmí obsahovat jiné řádky.',
  oneAnswer: 'Odpověď na žádost je buď dar, nebo půjčka.',
  requestFromVassal: 'Žádost o pomoc posílá vazal pánovi.',
  answerFromLord: 'Dar a půjčku nabízí pán.',
  firstIsRequest: 'Jednání o pomoci začíná žádostí vazala.',
  answerNeeded: 'Na žádost se odpovídá darem nebo půjčkou.',
  badVillage: 'Ves musí patřit tomu, kdo ji uvádí.',
  noTarget: 'Příjemce nemá kam zásilku poslat.',
} as const;

/** Cena splátky v kg obilí: obilí 1, seno `hayValueKg`, dobytek, kůň a kláda podle ceny obchodu. */
export function installmentValue(goods: MacroGoods): number {
  const L = VASSALAGE.loan;
  let value = goods.grainKg + goods.hayKg * L.hayValueKg;
  for (const good of CATTLE_GOODS) value += goods.cattle[good] * TRADE_GOOD_VALUES[good].valueKg;
  return value + goods.horses * L.horseValueKg + goods.logs * TRADE_GOOD_VALUES.logs.valueKg;
}

/** Hodnota všech splátek kalendáře. */
export function scheduleValue(schedule: readonly LoanInstallment[]): number {
  return schedule.reduce((sum, i) => sum + installmentValue(i.goods), 0);
}

/** Hodnota splátek splatných nejpozději v roce `year` (dluží se kumulativně). */
export function dueValue(schedule: readonly LoanInstallment[], year: number): number {
  return schedule
    .filter((i) => i.year <= year)
    .reduce((sum, i) => sum + installmentValue(i.goods), 0);
}

/** Zboží splátek splatných nejpozději v roce `year` (co se hráči ukáže jako domluvené). */
export function dueGoods(schedule: readonly LoanInstallment[], year: number): MacroGoods {
  return schedule
    .filter((i) => i.year <= year)
    .reduce((sum, i) => addMacro(sum, i.goods), noMacroGoods());
}

/** Zbývající dluh v kg obilí po zaplacené hodnotě `paidKg` (nejméně 0). */
export function remainingDebt(schedule: readonly LoanInstallment[], paidKg: number): number {
  return Math.max(0, scheduleValue(schedule) - paidKg);
}

/** Dluh po splatnosti k roku `year`: splatné splátky mínus zaplaceno (nejméně 0). */
export function overdueDebt(
  schedule: readonly LoanInstallment[],
  paidKg: number,
  year: number,
): number {
  return Math.max(0, dueValue(schedule, year) - paidKg);
}

/** Svazek bez lidí a roboty – pomoc je jen zboží. */
export function checkAidBundle(b: MacroBundle): string | null {
  const people = b.people.families + b.people.men + b.people.women;
  if (people !== 0 || b.laborDays !== 0) return AID_REASONS.badBundle;
  return checkBundle(b);
}

/** Zboží jedné splátky: v mezích a neprázdné (jako svazek bez lidí). */
function checkGoods(goods: MacroGoods): string | null {
  return checkAidBundle({ ...goods, people: { families: 0, men: 0, women: 0 }, laborDays: 0 });
}

/** Kalendář: 1 až `maxInstallments` splátek, roky celé, rostoucí, zboží v mezích. */
export function checkSchedule(schedule: readonly LoanInstallment[]): string | null {
  const L = VASSALAGE.loan;
  if (schedule.length === 0 || schedule.length > L.maxInstallments) return AID_REASONS.badSchedule;
  let last = -1;
  for (const i of schedule) {
    const okYear = Number.isInteger(i.year) && i.year > last && i.year <= L.maxYear;
    if (!okYear || checkGoods(i.goods) !== null) return AID_REASONS.badSchedule;
    last = i.year;
  }
  return null;
}

/** Kontrola čísel jednoho řádku o pomoci (vlastnictví vsí hlídá use-case). */
export function checkAidLine(line: AidLine): string | null {
  const bad = checkAidBundle(line.bundle);
  if (bad) return bad;
  if (line.kind === 'loan') return checkSchedule(line.schedule);
  return null;
}

/**
 * Kontrola řádků jednání o pomoci: jen řádky o pomoci, jeden řádek na kolo; `author` vazala
 * posílá žádost, pán dar nebo půjčku (`vassalIsAuthor`).
 */
export function checkAidItems(
  items: readonly { kind: string }[],
  vassalIsAuthor: boolean,
): string | null {
  const aid = items.filter(isAidLine);
  if (aid.length !== items.length) return AID_REASONS.mixed;
  const line = aid[0];
  if (!line || aid.length !== 1) return AID_REASONS.oneAnswer;
  if (line.kind === 'aid-request' && !vassalIsAuthor) return AID_REASONS.requestFromVassal;
  if (line.kind === 'gift' && vassalIsAuthor) return AID_REASONS.answerFromLord;
  return checkAidLine(line);
}
