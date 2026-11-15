import { sameCell } from '../village/people/world-grid';
import type {
  JourneyCommand,
  JourneyIntentBody,
  JourneyParty,
  JourneyState,
  LegacyJourneyState,
} from './journey-types';

// Převod výjezdu vojvody na výpravu (plán 2026-11-14 – Rozhodnutí 4, Review Focus 1): kontrolní body
// a záměry z doby jedné skupiny se dopočtou stejně jako před výpravami. Převádí se při čtení – krok
// (`stepJourney`) i aplikace (pohled, worker); do úložiště se nic nezapisuje zvlášť, převedený stav
// uloží další bod.

/**
 * Stav výpravy z kontrolního bodu: nový tvar beze změny (týž objekt), starší bod (jedna skupina)
 * převede – skupina 0 s hloučkem 0, čekání (`arrivedTick`) a fáze `returning` přejdou do skupiny,
 * vojvoda dostane `leaderName` jako `name`. Skupina bez živého vojvody je `leaderless` (starý krok
 * bez něj rozkazy zahazoval). Hlouček venku na cestě přes okraj (cíl na jiné mapě – jinou trasu
 * starý rozkaz ven neměl) dostane `crossing`, ať zastaví na okraji jako dřív. Jezdec na koni
 * (`mounted`) dostane `horse: 'ridden'` bez `horseId` – ves o koni neví, kůň se vrátí s ním (plán
 * 2026-11-14 – Úloha 3). Vstup nemění; převod je idempotentní.
 */
export function upgradeJourney(state: JourneyState | LegacyJourneyState): JourneyState {
  if (!isLegacy(state)) return state;
  const { phase, leaderName, members, groups, arrivedTick, ...rest } = state;
  const first = groups[0];
  const crossing =
    phase === 'out' &&
    first !== undefined &&
    !first.arrived &&
    first.goal !== null &&
    !sameCell(first.goal.cell, first.cell);
  const party: JourneyParty = {
    id: 0,
    phase: phase === 'returning' ? 'returning' : 'out',
    arrivedTick,
    ...(crossing ? { crossing: true as const } : {}),
    ...(members.some((m) => m.lord && m.status === 'active') ? {} : { leaderless: true as const }),
  };
  return {
    ...rest,
    phase: phase === 'done' ? 'done' : 'out',
    leaderName,
    members: members.map((m) => ({
      ...m,
      group: 0,
      ...(m.lord ? { name: leaderName } : {}),
      ...(m.mounted ? { horse: 'ridden' as const } : {}),
    })),
    groups: groups.map((g) => ({ ...g, party: 0 })),
    parties: [party],
    nextId: 1,
  };
}

/** Starší bod – bez skupin hráče (`parties`). */
function isLegacy(state: JourneyState | LegacyJourneyState): state is LegacyJourneyState {
  return !Array.isArray((state as Partial<JourneyState>).parties);
}

/** Příkaz záměru: starý záměr (rozkaz bez lidí) platí pro všechny, koho hráč řídí. */
export function commandOf(body: JourneyIntentBody): JourneyCommand {
  switch (body.kind) {
    case 'go':
    case 'cross':
    case 'home':
      return { kind: 'order', order: body };
    default:
      return body;
  }
}
