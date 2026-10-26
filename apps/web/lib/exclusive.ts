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

/** Po jak dlouhém čekání nebo běhu se do logu zapíše varování (ms). */
export const EXCLUSIVE_WARN_MS = 120_000;

function warnAfter(message: string): () => void {
  const timer = setTimeout(() => console.warn(message), EXCLUSIVE_WARN_MS);
  timer.unref?.();
  return () => clearTimeout(timer);
}

interface Queued<T> {
  result: Promise<T>;
  tail: Tail;
}

function enqueue<T>(key: string, run: () => Promise<T>): Queued<T> {
  const map = tails();
  const previous = map.get(key) ?? Promise.resolve();
  const stopWaiting = warnAfter(`exclusive(${key}): čeká ve frontě déle než 120 s`);
  const result = previous.then(() => {
    stopWaiting();
    const stopRunning = warnAfter(`exclusive(${key}): běží déle než 120 s`);
    return run().finally(stopRunning);
  });
  const tail: Tail = result.then(
    () => undefined,
    () => undefined,
  );
  map.set(key, tail);
  void tail.then(() => {
    if (map.get(key) === tail) map.delete(key);
  });
  return { result, tail };
}

/**
 * Spustí `run` až po dokončení předchozí operace téhož klíče (i když skončila chybou – ta se
 * nepřilepí, patří jen svému volajícímu). Po dokončení poslední operace se klíč z mapy uklidí.
 *
 * Záměrně BEZ timeoutu, který by frontu uvolnil: skok v čase o desetiletí trvá minuty a po
 * uvolnění by se vrátily souběžné dopočty téže vsi (konflikty verzí, počítání dvakrát). Při čekání
 * nebo běhu přes `EXCLUSIVE_WARN_MS` se jen zapíše varování do logu.
 */
export function exclusive<T>(key: string, run: () => Promise<T>): Promise<T> {
  return enqueue(key, run).result;
}

interface SharedEntry {
  result: Promise<unknown>;
  tail: Tail;
}

const SHARED = Symbol.for('bohemia.exclusive-shared');
const sharedGlobals = globalThis as unknown as Record<symbol, Map<string, SharedEntry> | undefined>;

function sharedEntries(): Map<string, SharedEntry> {
  let map = sharedGlobals[SHARED];
  if (!map) {
    map = new Map();
    sharedGlobals[SHARED] = map;
  }
  return map;
}

/**
 * Jako `exclusive`, ale volání téhož klíče a téhož `variant` (např. stejný herní den), které přijde,
 * dokud poslední operací ve frontě je právě takové sdílené volání (čeká nebo běží), dostane jeho
 * výsledek místo nového místa ve frontě. Fronta tak neroste, když klient dotazuje rychleji, než
 * server stíhá, a akce hráče nečeká za zbytečnými dotazy. Jakmile se za sdílené volání zařadí
 * jiná operace (akce), další volání už se řadí za ni – uvidí její výsledek.
 */
export function exclusiveShared<T>(
  key: string,
  variant: string,
  run: () => Promise<T>,
): Promise<T> {
  const entries = sharedEntries();
  const id = `${key}\u0000${variant}`;
  const existing = entries.get(id);
  if (existing && tails().get(key) === existing.tail) return existing.result as Promise<T>;
  const queued = enqueue(key, run);
  const entry: SharedEntry = queued;
  entries.set(id, entry);
  void queued.tail.then(() => {
    if (entries.get(id) === entry) entries.delete(id);
  });
  return queued.result;
}

/** Počet klíčů, na které se ještě čeká (testy – mapa se musí uklidit). */
export function pendingExclusiveKeys(): number {
  return tails().size;
}
