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
  if (known && sameParts(known, parts)) return known;
  const map = new Map(parts.map((p) => [p.id, p]));
  cache.set(parts, map);
  return map;
}

const cache = new WeakMap<readonly FieldPart[], Map<number, FieldPart>>();

/** Mapa má právě díly `parts` v jejich pořadí, každý pod svým id. */
function sameParts(map: ReadonlyMap<number, FieldPart>, parts: readonly FieldPart[]): boolean {
  if (map.size !== parts.length) return false;
  let k = 0;
  for (const [id, part] of map) {
    const p = parts[k++];
    if (p !== part || p.id !== id) return false;
  }
  return true;
}
