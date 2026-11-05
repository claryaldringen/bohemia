/** Hrana sítě vazalství: pán a vazal (strany jsou rody – `house.id`). */
export interface VassalEdge {
  lordHouseId: string;
  vassalHouseId: string;
}

/**
 * Vzájemné vazalství: nová přísaha `lord` → `vassal` je zakázaná, když už `vassal` je pánem
 * `lord` (vassalage.md – Síť dohod; Martin: „Anu, udělej to, jak říkáš“). Zakázané je jen
 * **přímé** vzájemné vazalství; delší kruhy přes víc rodů (A → B → C → A) zakázané nejsou.
 */
export function wouldBeMutual(edges: readonly VassalEdge[], lord: string, vassal: string): boolean {
  return edges.some((e) => e.lordHouseId === vassal && e.vassalHouseId === lord);
}

/**
 * Strom pod rodem: všichni, ke kterým od rodu vede cesta dolů po dohodách (vazalové, jejich
 * vazalové atd.), každý jednou, v pořadí od nejbližších. Kruh se ukáže jednou a dál nepokračuje;
 * kořen je ve výsledku jen tehdy, když se k němu cesta vrací kruhem (návrh Clauda).
 */
export function treeBelow(edges: readonly VassalEdge[], houseId: string): string[] {
  const vassalsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = vassalsOf.get(e.lordHouseId);
    if (list) list.push(e.vassalHouseId);
    else vassalsOf.set(e.lordHouseId, [e.vassalHouseId]);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  let frontier: string[] = [houseId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const v of vassalsOf.get(id) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v);
        result.push(v);
        next.push(v);
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Celá souvislá síť kolem rodů (nahoru i dolů po dohodách, bez ohledu na směr), každý rod
 * jednou; zadané rody jsou součástí výsledku, v pořadí od nich.
 */
export function treeAround(edges: readonly VassalEdge[], houseIds: readonly string[]): string[] {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    const list = neighbours.get(a);
    if (list) list.push(b);
    else neighbours.set(a, [b]);
  };
  for (const e of edges) {
    link(e.lordHouseId, e.vassalHouseId);
    link(e.vassalHouseId, e.lordHouseId);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  let frontier: string[] = [];
  for (const id of houseIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    frontier.push(id);
  }
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbours.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        result.push(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return result;
}
