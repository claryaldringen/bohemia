/**
 * Kopie stavu vsi. Stav je čistá data jako v JSON (ukládá se do databáze jako JSON): objekty, pole
 * a primitivní hodnoty – ty se kopírují ručně, což je pro stav s tisíci dílů polí několikrát
 * rychlejší než `structuredClone` (kopie stavu na začátku `advanceVillage` byla třetina času
 * kalibrace). Cokoli jiného (Map, Set, Date, typované pole, instance třídy) zkopíruje
 * `structuredClone`, takže výsledek je stejný. Sdílené odkazy uvnitř stavu se rozdělí na
 * samostatné kopie – stejně jako při uložení do JSON a načtení, na kterém simulace nezávisí.
 *
 * **Pravidlo: záznamy v seznamech `SHARED_RECORD_LISTS`, body pevných cest
 * (`roads.roads[].points`), profily zemních prací (`roads.earthworks[].profile`) a buňky dílů polí
 * (`parts[].cell`) se nemění na místě** – seznamy se jen doplňují, filtrují nebo se v nich záznam
 * nahradí novým objektem, díl dostane novou buňku jen novým objektem. Proto se u objektu na nejvyšší
 * úrovni (stav vsi) kopírují jen tyto seznamy a jejich záznamy kopie sdílí s původním stavem (u
 * Vlkova 14 z 34 tisíc objektů; profily a buňky dílů dalších ≈ 10 tisíc). Kdo by záznam změnil na
 * místě, změnil by i vstupní stav; v testech to hlídá `freezeSharedRecords` – sdílené záznamy se
 * zmrazí a zápis do nich spadne.
 */
export function cloneState<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return cloneObject(value) as T;
  }
  const copy: Record<string, unknown> = {};
  for (const key in value) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v !== 'object' || v === null) copy[key] = v;
    else if (Array.isArray(v) && SHARED_RECORD_LISTS.has(key)) copy[key] = sharedList(v);
    else if (key === 'roads') copy[key] = cloneRoads(v);
    else if (key === 'parts' && Array.isArray(v)) copy[key] = v.map(clonePart);
    else copy[key] = cloneObject(v);
  }
  return copy as T;
}

/**
 * Seznamy stavu vsi, jejichž záznamy se nikdy nemění na místě (viz `cloneState`): překážky
 * odstraněné natrvalo, pokácené stromy (sazenici na pařez zapíše nový záznam – `plantOnStump`)
 * a kronika.
 */
const SHARED_RECORD_LISTS: ReadonlySet<string> = new Set([
  'clearedObstacles',
  'felledTrees',
  'chronicle',
]);

let freezeShared = false;

/**
 * Pojistka pravidla sdílených záznamů (testy a měření): od zapnutí kopie stavu sdílené záznamy
 * zmrazí (`Object.freeze`), takže kdo je mění na místě, spadne s TypeError. Simulace sama ji
 * nezapíná – zmrazení stojí čas.
 */
export function freezeSharedRecords(on: boolean): void {
  freezeShared = on;
}

function sharedList(list: readonly unknown[]): unknown[] {
  if (freezeShared) for (const record of list) deepFreeze(record);
  return list.slice();
}

/** Pevné cesty: vše se kopíruje, jen body cest se sdílí (seznam bodů je nový). */
function cloneRoads(roads: object): unknown {
  if (Array.isArray(roads) || Object.getPrototypeOf(roads) !== Object.prototype) {
    return cloneObject(roads);
  }
  const copy: Record<string, unknown> = {};
  for (const key in roads) {
    const v = (roads as Record<string, unknown>)[key];
    if (typeof v !== 'object' || v === null) copy[key] = v;
    else if (key === 'roads' && Array.isArray(v)) copy[key] = v.map(cloneRoad);
    else if (key === 'earthworks' && Array.isArray(v)) copy[key] = v.map(cloneEarthwork);
    else copy[key] = cloneObject(v);
  }
  return copy;
}

function cloneRoad(road: unknown): unknown {
  return cloneSharing(road, 'points');
}

/** Zemní práce: vše se kopíruje, jen body profilu se sdílí (seznam bodů je nový). */
function cloneEarthwork(earthwork: unknown): unknown {
  return cloneSharing(earthwork, 'profile');
}

/**
 * Díl pole: vše se kopíruje, jen buňka dílu se sdílí. Díl má skoro jen primitivní hodnoty – kopie
 * rozložením (`{ ...part }`, tytéž klíče ve stejném pořadí) a pak vnořené objekty kromě buňky; je
 * o čtvrtinu rychlejší než přiřazování po klíčích.
 */
function clonePart(part: unknown): unknown {
  if (typeof part !== 'object' || part === null) return part;
  if (Array.isArray(part) || Object.getPrototypeOf(part) !== Object.prototype) {
    return cloneObject(part);
  }
  const copy: Record<string, unknown> = { ...part };
  for (const key in copy) {
    const v = copy[key];
    if (typeof v !== 'object' || v === null) continue;
    copy[key] = key === 'cell' ? sharedRecord(v) : cloneObject(v);
  }
  return copy;
}

/**
 * Kopie záznamu, ve které se seznam pod klíčem `shared` zkopíruje jako nový seznam se sdílenými
 * záznamy (viz `cloneState`).
 */
function cloneSharing(record: unknown, shared: string): unknown {
  if (typeof record !== 'object' || record === null) return record;
  if (Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) {
    return cloneObject(record);
  }
  const copy: Record<string, unknown> = {};
  for (const key in record) {
    const v = (record as Record<string, unknown>)[key];
    if (typeof v !== 'object' || v === null) copy[key] = v;
    else if (key !== shared) copy[key] = cloneObject(v);
    else if (Array.isArray(v)) copy[key] = sharedList(v);
    else copy[key] = cloneObject(v);
  }
  return copy;
}

function sharedRecord(record: object): object {
  if (freezeShared) deepFreeze(record);
  return record;
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
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
