import type { Pause } from '@bohemia/game';

// Přestávky v dlouhém dopočtu vsi (port Pause): server běží v jednom vlákně a dopočet vsi po
// dlouhé nepřítomnosti nebo přeskok času o 10 let trvá desítky sekund – mezitím by neodpověděl
// nikomu. Dopočet proto po každém dni zkontroluje, jak dlouho už počítá v kuse, a po ≈ 50 ms
// pustí přes setImmediate ke slovu ostatní požadavky (server action i vykreslení stránky jsou
// asynchronní, Next.js na čekání nic nemění). Výsledek dopočtu na přestávkách nezávisí.

/** Jak dlouho dopočet nejvýš počítá v kuse (ms). Jeden drahý den (síť pěšin) bývá i delší. */
export const COMPUTE_SLICE_MS = 50;

/** Nové přestávky pro jeden požadavek – měří čas od začátku dopočtu, pak od poslední přestávky. */
export function computePause(
  sliceMs: number = COMPUTE_SLICE_MS,
  now: () => number = () => performance.now(),
  yieldToOthers: () => Promise<void> = () => new Promise((resolve) => setImmediate(resolve)),
): Pause {
  let since = now();
  return () => {
    if (now() - since < sliceMs) return null;
    return yieldToOthers().then(() => {
      since = now();
    });
  };
}
