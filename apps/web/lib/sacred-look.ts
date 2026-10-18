// Vzhled posvátných míst podle času (happiness.md – Posvátný dub): ušetřené posvátné duby se
// postupně zvětší – lidé jim udělají prostor a stromy můžou víc růst (Martin 18. 10. 2026). Jen
// vzhled, pravidla se nemění. Čistý modul – počítá server do scény vsi.

/** Kolik dub naroste a za kolik let (návrh Clauda): o 30 % za 60 let od ušetření, pak už ne. */
export const SACRED_OAK_GROWTH = { extra: 0.3, years: 60 } as const;
const DAYS_PER_YEAR = 365.25;

/**
 * Násobek velikosti posvátného dubu ušetřeného v den `sparedDay` v den `day`:
 * 1 + 0,3 × min(1, roky / 60). Po celých herních letech – vzhled (a stínová mapa) se mění
 * nejvýš jednou za herní rok; deterministicky ze dne.
 */
export function sacredOakGrowth(sparedDay: number, day: number): number {
  const years = Math.max(0, Math.floor((day - sparedDay) / DAYS_PER_YEAR));
  return (
    1 +
    (SACRED_OAK_GROWTH.extra * Math.min(years, SACRED_OAK_GROWTH.years)) / SACRED_OAK_GROWTH.years
  );
}
