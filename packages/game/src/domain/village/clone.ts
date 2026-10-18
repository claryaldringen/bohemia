/**
 * Hluboká kopie stavu vsi. Stav je čistá data jako v JSON (ukládá se do databáze jako JSON):
 * objekty, pole a primitivní hodnoty – ty se kopírují ručně, což je pro stav s tisíci dílů polí
 * několikrát rychlejší než `structuredClone` (kopie stavu na začátku `advanceVillage` byla třetina
 * času kalibrace). Cokoli jiného (Map, Set, Date, typované pole, instance třídy) zkopíruje
 * `structuredClone`, takže výsledek je stejný. Jediný rozdíl: sdílené odkazy uvnitř stavu se
 * rozdělí na samostatné kopie – stejně jako při uložení do JSON a načtení, na kterém simulace
 * nezávisí.
 */
export function cloneState<T>(value: T): T {
  return clonePlain(value) as T;
}

function clonePlain(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const copy: unknown[] = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) copy[i] = clonePlain(value[i]);
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return structuredClone(value);
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    copy[key] = clonePlain((value as Record<string, unknown>)[key]);
  }
  return copy;
}
