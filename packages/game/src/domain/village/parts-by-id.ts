import type { FieldPart } from './types';

/**
 * Díly podle id – jako `new Map(parts.map((p) => [p.id, p]))`, jen z paměti po seznamu dílů: den
 * vsi staví takovou mapu z `state.parts` (3,8 tisíce dílů u Vlkova) osmkrát i víckrát. Mapa
 * z paměti platí, jen když má tytéž díly ve stejném pořadí a pod týmiž id (ověření je ≈ pětkrát
 * levnější než nová mapa); seznam doplněný, zkrácený nebo s nahrazeným dílem dostane novou mapu.
 * Mapa se nikdy nemění na místě – kdo ji drží z dřívějška, má dál tytéž díly (jen zrychlení,
 * výsledek týž).
 */
export function partsByIdOf(parts: readonly FieldPart[]): ReadonlyMap<number, FieldPart> {
  const known = cache.get(parts);
  if (known && sameParts(known, parts)) return known.map;
  const map = new Map(parts.map((p) => [p.id, p]));
  cache.set(parts, { map, parts: parts.slice(), ids: Float64Array.from(parts, (p) => p.id) });
  return map;
}

/** Mapa z paměti a díly s id, ze kterých vznikla (v pořadí seznamu). */
interface KnownParts {
  map: Map<number, FieldPart>;
  parts: readonly FieldPart[];
  ids: Float64Array;
}

const cache = new WeakMap<readonly FieldPart[], KnownParts>();

/**
 * Seznam má tytéž díly ve stejném pořadí a pod týmiž id jako při stavbě mapy – mapa je tedy
 * táž, jakou by postavila nová.
 */
function sameParts(known: KnownParts, parts: readonly FieldPart[]): boolean {
  if (known.parts.length !== parts.length) return false;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    if (p !== known.parts[k] || p.id !== known.ids[k]) return false;
  }
  return true;
}
