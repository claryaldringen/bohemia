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
  return cloneObject(value);
}

/**
 * Kopie objektu nebo pole; primitivní hodnoty uvnitř se přiřadí rovnou (bez volání – stav má
 * přes sto tisíc čísel a řetězců). `for…in` u prostého objektu (prototyp `Object.prototype`
 * bez vyčíslitelných vlastností) projde tytéž klíče ve stejném pořadí jako `Object.keys`, jen
 * bez pole klíčů.
 */
function cloneObject(value: object): unknown {
  if (Array.isArray(value)) {
    const n = value.length;
    const copy: unknown[] = new Array<unknown>(n);
    for (let i = 0; i < n; i++) {
      const v: unknown = value[i];
      copy[i] = typeof v === 'object' && v !== null ? cloneObject(v) : v;
    }
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return structuredClone(value);
  const copy: Record<string, unknown> = {};
  for (const key in value) {
    const v = (value as Record<string, unknown>)[key];
    copy[key] = typeof v === 'object' && v !== null ? cloneObject(v) : v;
  }
  return copy;
}
