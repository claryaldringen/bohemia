/** Port aktivních dnů hráče: dny (datum v Europe/Prague), kdy byl ve hře. */
export interface ActivityRepository {
  /** Zapíše den (`YYYY-MM-DD`); opakovaný zápis téhož dne nic nemění. */
  record(playerId: string, pragueDate: string): Promise<void>;
  /** Počet různých zapsaných dnů hráče. */
  distinctDays(playerId: string): Promise<number>;
}

const PRAGUE_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Datum `YYYY-MM-DD` v Europe/Prague pro okamžik `at` (čas přichází parametrem). */
export function pragueDateOf(at: Date): string {
  const parts = Object.fromEntries(PRAGUE_DATE.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Zapíše hráčovu přítomnost ve hře dnes (nejvýš jeden zápis za den). */
export async function recordActiveDay(
  deps: { activity: ActivityRepository },
  playerId: string,
  now: Date,
): Promise<void> {
  await deps.activity.record(playerId, pragueDateOf(now));
}
