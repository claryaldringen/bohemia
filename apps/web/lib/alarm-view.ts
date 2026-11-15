import {
  ALARM_BLOCKED,
  type AlarmChoice,
  type AlarmReturn,
  type AlarmRunner,
  type AlarmView,
} from '@bohemia/game';

// Varování a útěk v rozhraní (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 12): texty popisků a důvodů u kurzoru, odhady ve dnech. Kdy se ptát, řídí události ze
// serveru (`useAlarm`). Čistý modul – smí do prohlížeče; ikony v panelu vsi (Úloha 13) berou
// texty odtud.

export type { AlarmChoice, AlarmView } from '@bohemia/game';

/** Názvy ikon – doslovně ze specu (war.md – Rozhraní). */
export const ALARM_LABELS: Readonly<Record<AlarmChoice | 'return', string>> = {
  messenger: 'Poslat posla',
  forest: 'Ukrýt v lese',
  people: 'Do hradiště – jen lidé',
  all: 'Do hradiště – se vším',
  return: 'Vrátit se',
};

/** Odhad času v herních dnech: „méně než den“, „≈ 1 den“, „≈ 3 dny“, „≈ 5 dní“ (návrh Clauda). */
export function daysText(days: number): string {
  if (days < 0.5) return 'méně než den';
  const n = Math.round(days);
  if (n === 1) return '≈ 1 den';
  return n >= 2 && n <= 4 ? `≈ ${n} dny` : `≈ ${n} dní`;
}

/** „vojsko tu bude za ≈ 2 dny“ / „vojsko už je tu“. */
function armyText(days: number | null): string | null {
  if (days === null) return null;
  return days <= 0 ? 'vojsko už je tu' : `vojsko tu bude za ${daysText(days)}`;
}

/** Popisek volby: název, důvod zašedlé volby (červeně), nebo odhad cesty. */
export interface AlarmOptionText {
  label: string;
  /** Proč nejde (u kurzoru); null – jde. */
  denied: string | null;
  /** Odhad u volby, která jde; null – žádný. */
  detail: string | null;
}

/**
 * Popisek ikony volby `choice`: zašedlá – důvod („Nestihnou to – vojsko tu bude za ≈ 2 dny, z mapy
 * jim to potrvá ≈ 3 dny.“ – plán, Úloha 12), jinak odhad („Do hradiště Hradec ≈ 2 dny – vojsko tu
 * bude za ≈ 3 dny.“).
 */
export function alarmOptionText(view: AlarmView, choice: AlarmChoice): AlarmOptionText {
  const option = view.options[choice];
  const label = ALARM_LABELS[choice];
  const army = armyText(view.armyEtaDays);
  if (option.blocked === 'too-late') {
    const parts = [
      army,
      option.leaveDays === undefined ? null : `z mapy jim to potrvá ${daysText(option.leaveDays)}`,
    ]
      .filter((p): p is string => p !== null)
      .join(', ');
    const reason = ALARM_BLOCKED['too-late'].replace(/\.$/, '');
    return { label, denied: parts === '' ? `${reason}.` : `${reason} – ${parts}.`, detail: null };
  }
  if (option.blocked !== null)
    return { label, denied: ALARM_BLOCKED[option.blocked], detail: null };
  if (option.etaDays === undefined) return { label, denied: null, detail: null };
  const where =
    choice === 'forest' ? 'Do lesa' : view.host ? `Do hradiště ${view.host.name}` : 'Do hradiště';
  const tail = choice === 'messenger' || army === null ? '' : ` – ${army}`;
  return { label, denied: null, detail: `${where} ${daysText(option.etaDays)}${tail}.` };
}

/** Kdo poběží: „Vesničan pěšky ≈ 1 den.“ / „Bořek na koni – méně než den.“ */
export function runnerText(runner: AlarmRunner): string {
  const who = runner.line ? (runner.name ?? 'Muž rodu') : 'Vesničan';
  const how = runner.mounted ? 'na koni' : 'pěšky';
  return runner.etaDays === null ? `${who} ${how}.` : `${who} ${how} ${daysText(runner.etaDays)}.`;
}

/** Stav po útěku: na cestě, v hradišti, v lese, dostiženi; nikdo neodešel – null. */
export function flightText(view: AlarmView): string | null {
  const flight = view.flight;
  if (!flight) return null;
  const host = view.host ? `do hradiště ${view.host.name}` : 'do hradiště';
  switch (flight.status) {
    case 'marching':
      return flight.mode === 'forest'
        ? 'Lidé jdou do lesa.'
        : `Lidé jdou ${host}${flight.etaDays === null ? '' : ` – ${daysText(flight.etaDays)}`}.`;
    case 'arrived':
      return `Lidé došli ${host}.`;
    case 'hidden':
      return 'Lidé se ukryli v lese.';
    case 'caught':
      return 'Vojsko lidi dostihlo.';
  }
}

/** Popisek Vrátit se: důvod, nebo kdy budou doma. */
export function returnText(ret: AlarmReturn): AlarmOptionText {
  const label = ALARM_LABELS.return;
  if (ret.backInDays !== undefined) {
    const when = ret.backInDays <= 0 ? 'dnes' : `za ${daysText(ret.backInDays)}`;
    return { label, denied: ret.blocked, detail: `Lidé budou doma ${when}.` };
  }
  return { label, denied: ret.blocked, detail: null };
}

/** Číslo na ikoně stavu (dny do příchodu, lhůta): „<1“ pod půl dne, jinak zaokrouhlené dny. */
export function daysBadge(days: number): string {
  return days < 0.5 ? '<1' : String(Math.round(days));
}

/** Stav posla (popisek ikony Poslat posla – návrh Clauda): běží, doběhl, chytili ho. */
export function messengerText(view: AlarmView): string | null {
  const m = view.messenger;
  if (!m) return null;
  const host = view.host ? `do hradiště ${view.host.name}` : 'do hradiště';
  switch (m.status) {
    case 'running':
      return m.mounted ? `Posel jede na koni ${host}.` : `Posel běží ${host}.`;
    case 'arrived':
      return `Posel doběhl ${host}.`;
    case 'caught':
      return 'Posla chytili.';
    case 'recalled':
      return 'Vojsko odtáhlo dřív, než posel doběhl.';
  }
}

/** Popisek bílé vlajky (návrh Clauda): vzdá se vojvoda, nájezd skončí. */
export const YIELD_LORD_LABEL = 'Vzdát se – vojvoda půjde do zajetí, nájezd skončí.';

/** Název ikony hradiště hráče, které varuje vsi domény (návrh Clauda). */
export const ALARM_DOMAIN_LABEL = 'Varovat doménu';

/** Popisek tlačítka odeslání poslů do domény: „Poslat posly (2) – smíš ještě 3.“ */
export function domainSendText(chosen: number, left: number): string {
  const rest = `smíš ještě ${left}`;
  return chosen === 0 ? `Vyber vsi – ${rest}.` : `Poslat posly (${chosen}) – ${rest}.`;
}
