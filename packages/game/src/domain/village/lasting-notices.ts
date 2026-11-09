// Upozornění vsi do kroniky (absence.md – Upozornění vsi do kroniky; Martin 9. 11. 2026: „Ano, ať
// se zapisují do kroniky“): trvalé stavy vsi z upozornění – podmínky jsou tady, web z nich
// ukazuje řádky nahoře a simulace na konci dne zapíše do kroniky začátek a konec stavu s herním
// datem, ne denně. Stav kratší než NOTICE_CHRONICLE_MIN_DAYS dní se nezapíše a stejně krátké
// přerušení ho neukončí (návrh Clauda). Jednorázové události (porážka, úhyn, chybí len…) jsou
// v kronice samy.

import { oxenOverRoom } from './draft';
import { horsesOverRoom } from './horse-breeding';
import { horseGrainToday, horsePens, villageHorses } from './horses';
import { herdsOverRoom } from './pens';
import { occupants } from './people';
import { NOTICE_CHRONICLE_MIN_DAYS } from './rules';
import { constructionsStalled, hungerLevel, workshopActivity, type HungerLevel } from './summary';
import { threshingStatus } from './threshing';
import type { ChronicleEvent, LastingNotice, LastingNoticeState, VillageState } from './types';

/** Trvalé stavy v pevném pořadí – v tomto pořadí se zapisují začátky jednoho dne. */
export const LASTING_NOTICES: readonly LastingNotice[] = [
  'rationing',
  'hungry',
  'starving',
  'stalled',
  'no-charcoal',
  'no-ore',
  'no-clay',
  'no-wood',
  'carpenter-no-wood',
  'pen-short',
  'oxen-short',
  'horses-short',
  'horses-ungrained',
  'dogs-ungrained',
  'emergency-threshing',
  'threshing-floor-short',
];

/** Vnořené stupně hladu – ves, která hladoví, i šetří; ves, kde lidé umírají hlady, i hladoví. */
const HUNGER_NOTICES: Record<HungerLevel, readonly LastingNotice[]> = {
  fed: [],
  rationing: ['rationing'],
  hungry: ['rationing', 'hungry'],
  starving: ['rationing', 'hungry', 'starving'],
};

/** Celé kusy psů dvorce – zlomek se nepočítá (technická mez zaokrouhlení). */
const DOG_EPSILON = 1e-6;

/**
 * Jezdečtí koně jsou bez obilí (horses.md – Co hráč vidí): ves s ohradou koní dnes obilí koním
 * nedala a nějaký kůň ho potřebuje.
 */
export function horsesUngrained(
  state: Pick<VillageState, 'pens' | 'horsesFed'>,
  day: number,
): boolean {
  if (state.horsesFed !== false || horsePens(state).length === 0) return false;
  return horseGrainToday(villageHorses(state), day) > 0;
}

/** Psi dvorce jsou bez obilí (wildlife.md – Psi): ves má aspoň jednoho psa a dnes je nenakrmila. */
export function dogsUngrained(state: Pick<VillageState, 'wildlife'>): boolean {
  const dogs = state.wildlife?.dogs;
  return dogs !== undefined && Math.floor(dogs.count + DOG_EPSILON) >= 1 && !dogs.fed;
}

/** Dílny bez vstupu (crafts.md, wagons.md) – jen obydlené, podle činnosti dne. */
function workshopNotices(state: VillageState): LastingNotice[] {
  const out = new Set<LastingNotice>();
  for (const d of state.dwellings) {
    if (!d.workshop) continue;
    const activity = workshopActivity(d.workshop, occupants(state, d.id).length);
    if (activity === 'no-charcoal' || activity === 'no-ore' || activity === 'no-clay') {
      out.add(activity);
    } else if (activity === 'no-wood') {
      out.add(d.workshop.craft === 'carpenter' ? 'carpenter-no-wood' : 'no-wood');
    }
  }
  return [...out];
}

/** Trvalé stavy vsi, které dnes platí (v pořadí `LASTING_NOTICES`); vymřelá ves žádné. */
export function lastingNotices(state: VillageState, day: number): LastingNotice[] {
  if (state.extinctDay !== undefined) return [];
  const active = new Set<LastingNotice>([
    ...HUNGER_NOTICES[hungerLevel(state)],
    ...(constructionsStalled(state) ? (['stalled'] as const) : []),
    ...workshopNotices(state),
    // jeden stav za všechny druhy – stáda přerůstají ohrady každé jaro (návrh Clauda)
    ...(herdsOverRoom(state).length > 0 ? (['pen-short'] as const) : []),
    ...(oxenOverRoom(state) ? (['oxen-short'] as const) : []),
    ...(horsesOverRoom(state, day) ? (['horses-short'] as const) : []),
    ...(horsesUngrained(state, day) ? (['horses-ungrained'] as const) : []),
    ...(dogsUngrained(state) ? (['dogs-ungrained'] as const) : []),
  ]);
  const threshing = threshingStatus(state, day);
  if (threshing.emergency) active.add('emergency-threshing');
  if (threshing.floorShort) active.add('threshing-floor-short');
  return LASTING_NOTICES.filter((notice) => active.has(notice));
}

/**
 * Trvalé stavy na konci dne (mutuje stav – `noticeStates`): porovná dnešní stavy s běžícími
 * a vrátí zápisy kroniky. Začátek se zapíše s dnem začátku, až stav trvá
 * NOTICE_CHRONICLE_MIN_DAYS dní; konec s prvním dnem bez stavu, až stav tolik dní chybí – a jen
 * když byl zapsán začátek. Kratší přerušení stav neukončí. Ves bez `noticeStates` (uložená dřív)
 * začne sledovat od dneška. Výsledek závisí jen na stavu a dni – dopočet po kouscích dá týž stav.
 */
export function noticeStatesDay(state: VillageState, day: number): ChronicleEvent[] {
  const active = new Set(lastingNotices(state, day));
  const states: Partial<Record<LastingNotice, LastingNoticeState>> = state.noticeStates ?? {};
  const began: ChronicleEvent[] = [];
  const ended: ChronicleEvent[] = [];
  for (const notice of LASTING_NOTICES) {
    const running = states[notice];
    if (active.has(notice)) {
      const current = running ?? { since: day };
      delete current.off;
      states[notice] = current;
      if (!current.logged && day - current.since + 1 >= NOTICE_CHRONICLE_MIN_DAYS) {
        current.logged = true;
        began.push({ day: current.since, kind: 'notice-began', notice });
      }
    } else if (running) {
      running.off ??= day;
      if (day - running.off + 1 >= NOTICE_CHRONICLE_MIN_DAYS) {
        if (running.logged) ended.push({ day: running.off, kind: 'notice-ended', notice });
        delete states[notice];
      }
    }
  }
  if (Object.keys(states).length > 0) state.noticeStates = states;
  else delete state.noticeStates;
  // konce od nejhoršího stupně – hlad skončí dřív, než ves přestane šetřit
  return [...ended.reverse(), ...began];
}
