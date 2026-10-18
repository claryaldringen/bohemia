import type { SceneVillage } from '../village-view';
import type { VillageTarget } from './village-picking';

// Výběr víc obydlí (migration.md – Výběr víc obydlí; jako v 0 A.D.): Ctrl / Shift + klik přidá
// nebo ubere obydlí z výběru, Ctrl + A vybere všechna hotová obydlí vsi. Čisté funkce bez
// Babylonu.

/** Id vybraných obydlí – jedno, víc, nebo žádné (vybrané je něco jiného). */
export function selectedDwellingIds(target: VillageTarget | null): readonly number[] {
  if (target?.kind === 'dwelling') return [target.id];
  if (target?.kind === 'dwellings') return target.ids;
  return [];
}

/** Výběr z id obydlí: žádné → nic, jedno → obydlí, víc → víc obydlí. */
export function dwellingsTarget(ids: readonly number[]): VillageTarget | null {
  const [first] = ids;
  if (first === undefined) return null;
  return ids.length === 1 ? { kind: 'dwelling', id: first } : { kind: 'dwellings', ids };
}

/**
 * Nový výběr po kliknutí do scény: bez modifikátoru vybere, co je pod kurzorem (prázdná zem
 * výběr zruší). S Ctrl / Shift (`additive`) přidá obydlí k vybraným obydlím, nebo ho z výběru
 * ubere, když už vybrané je; prázdná zem výběr nechá. Cokoli jiného než obydlí vybere samo
 * (víc najednou jde vybrat jen obydlí).
 */
export function nextSelection(
  current: VillageTarget | null,
  picked: VillageTarget | null,
  additive: boolean,
): VillageTarget | null {
  if (!additive) return picked;
  if (picked === null) return current;
  if (picked.kind !== 'dwelling') return picked;
  const ids = selectedDwellingIds(current);
  return ids.includes(picked.id)
    ? dwellingsTarget(ids.filter((id) => id !== picked.id))
    : dwellingsTarget([...ids, picked.id]);
}

/** Všechna hotová obydlí vsi (Ctrl + A) – staveniště ne, ještě v nich nikdo nebydlí. */
export function allDwellingsTarget(village: SceneVillage): VillageTarget | null {
  return dwellingsTarget(village.dwellings.filter((d) => d.built).map((d) => d.id));
}

/**
 * Vybraný cíl, jak ho ves po obnovení stavu ještě má: zaniklý cíl → null, z víc obydlí zbydou
 * jen existující (jedno zbylé je obydlí). Beze změny vrátí tentýž objekt.
 */
export function presentTarget(
  village: SceneVillage,
  target: VillageTarget | null,
): VillageTarget | null {
  if (target === null) return null;
  if (target.kind !== 'dwellings') {
    if (target.kind === 'dwelling') {
      return village.dwellings.some((d) => d.id === target.id) ? target : null;
    }
    return target;
  }
  const ids = target.ids.filter((id) => village.dwellings.some((d) => d.id === id));
  return ids.length === target.ids.length ? target : dwellingsTarget(ids);
}

/** Je klávesa výběr všech obydlí (Ctrl + A, na Macu i Cmd + A)? */
export function selectsAllDwellings(event: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.code === 'KeyA' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
  );
}
