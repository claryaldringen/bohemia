const MAX_SEED = 2 ** 31 - 1;

/** Seed z adresy vývojového náhledu – celé číslo 0 … 2^31 − 1, jinak výchozí 1. */
export function parseSeed(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const seed = Number(value);
  return seed <= MAX_SEED ? seed : 1;
}
