/**
 * Volba hráče, zda hrají zvuky krajiny – pamatuje si ji prohlížeč (localStorage). Úložiště
 * může chybět nebo být zakázané (soukromé okno, blokovaná data webu): volba pak platí jen do
 * zavření stránky. Výchozí stav je „zapnuto“ – zvuk stejně začne až po prvním gestu hráče.
 */
const STORAGE_KEY = 'bohemia.sound';

const listeners = new Set<() => void>();
let current: boolean | null = null;

export function getSoundPreference(): boolean {
  current ??= readStored();
  return current;
}

export function setSoundPreference(enabled: boolean): void {
  current = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Bez úložiště volba platí jen do zavření stránky.
  }
  for (const listener of listeners) listener();
}

/** Odběr změn (i z jiného panelu – událost `storage`) pro `useSyncExternalStore`. */
export function subscribeSoundPreference(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  current = readStored();
  for (const listener of listeners) listener();
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}
