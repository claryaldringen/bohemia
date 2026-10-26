// Dopočet vsí naráz (single-flight): v jednom procesu serveru běží pro jednoho hráče nejvýš jedna
// operace nad jeho vsemi. Dlouhý dopočet (skok v čase o rok, hráč dlouho nehrál) totiž po
// přestávkách (`computePause`) pouští ke slovu jiné požadavky; ty by načetly tutéž starou verzi vsi,
// počítaly totéž znovu a uložily by se až po prvním – `updateVillage` by jim verzi odmítl
// a dopočítával by potřetí. Tady se druhý požadavek na dokončení prvního počká a načte už
// dopočítanou ves, takže dopočte jen zbytek do svého dne (obvykle nic). Je to jen infrastruktura
// vstupního bodu – herní logika zůstává v use-casech.

type Tail = Promise<void>;

const STORE = Symbol.for('bohemia.exclusive-tails');
const globals = globalThis as unknown as Record<symbol, Map<string, Tail> | undefined>;

/** Fronty podle klíče; v `globalThis`, aby je sdílely i samostatně sbalené moduly Next.js. */
function tails(): Map<string, Tail> {
  let map = globals[STORE];
  if (!map) {
    map = new Map();
    globals[STORE] = map;
  }
  return map;
}

/** Klíč zámku pro vsi hráče (`dynastyStatus` dopočítává všechny jeho vsi, ne jednu). */
export function playerLockKey(playerId: string): string {
  return `player:${playerId}`;
}

/**
 * Spustí `run` až po dokončení předchozí operace téhož klíče (i když skončila chybou – ta se
 * nepřilepí, patří jen svému volajícímu). Po dokončení poslední operace se klíč z mapy uklidí.
 */
export function exclusive<T>(key: string, run: () => Promise<T>): Promise<T> {
  const map = tails();
  const previous = map.get(key) ?? Promise.resolve();
  const result = previous.then(run);
  const tail: Tail = result.then(
    () => undefined,
    () => undefined,
  );
  map.set(key, tail);
  void tail.then(() => {
    if (map.get(key) === tail) map.delete(key);
  });
  return result;
}

/** Počet klíčů, na které se ještě čeká (testy – mapa se musí uklidit). */
export function pendingExclusiveKeys(): number {
  return tails().size;
}
