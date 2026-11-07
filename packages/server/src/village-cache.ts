// Paměť vsí na jeden požadavek (identity map): akce nad vsí i dotaz na ves načítaly stav téže vsi
// víckrát – ověření vsi (`playerVillage`), dopočet všech vsí hráče (`dynastyStatus`), use-case
// (`updateVillage`) a pohled po akci (`dynastyStatus` znovu). U velké vsi je stav přes 2 MB JSON. V rozsahu
// `withVillageCache` se záznam vsi načte z úložiště jednou a dál se vrací z paměti, dokud
// levný otisk (`stampsOf` – verze a jméno bez stavu) říká, že se v úložišti nezměnil. Uložení
// paměť obnoví, neúspěšné (optimistický zámek – ves mezitím uložil jiný požadavek) ji pro ves
// zahodí, takže další pokus `updateVillage` načte čerstvou verzi. Stav vsi je neměnný (funkce
// jádra vstupní stav nemění), záznam z paměti je tedy tentýž, jaký by se načetl znovu. Je to jen
// infrastruktura vstupního bodu – herní logika zůstává v use-casech.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { VillageRecord, VillageRepository, VillageStamp } from '@bohemia/game';

type Records = Map<string, VillageRecord>;

const STORE = Symbol.for('bohemia.village-cache');
const globals = globalThis as unknown as Record<symbol, AsyncLocalStorage<Records> | undefined>;

/** Rozsahy paměti; v `globalThis`, aby je sdílely i samostatně sbalené moduly Next.js. */
function scopes(): AsyncLocalStorage<Records> {
  let storage = globals[STORE];
  if (!storage) {
    storage = new AsyncLocalStorage<Records>();
    globals[STORE] = storage;
  }
  return storage;
}

/** Spustí `run` s pamětí vsí (vnořené volání použije paměť vnějšího). */
export function withVillageCache<T>(run: () => Promise<T>): Promise<T> {
  const storage = scopes();
  if (storage.getStore()) return run();
  return storage.run(new Map(), run);
}

/** Záznam z paměti odpovídá otisku z úložiště (verze roste s každým uložením, jméno zvlášť). */
function matches(record: VillageRecord, stamp: VillageStamp | undefined): boolean {
  return stamp !== undefined && stamp.version === record.version && stamp.name === record.name;
}

/**
 * Úložiště vsí s pamětí aktuálního rozsahu `withVillageCache`; mimo rozsah `inner` beze změny.
 * Paměť se čte až při volání – úložiště vytvořené mimo rozsah ji v rozsahu použije taky.
 */
export function cachedVillages(inner: VillageRepository): VillageRepository {
  const records = (): Records | undefined => scopes().getStore();
  const remember = (record: VillageRecord | null): VillageRecord | null => {
    if (record) records()?.set(record.id, record);
    return record;
  };
  return {
    async find(villageId) {
      const known = records()?.get(villageId);
      if (known) {
        const stamps = await inner.stampsOf([known.settlementId]);
        if (
          matches(
            known,
            stamps.find((s) => s.id === villageId),
          )
        )
          return known;
        records()?.delete(villageId);
      }
      return remember(await inner.find(villageId));
    },
    async listBySettlement(settlementId) {
      const memory = records();
      if (memory) {
        const stamps = await inner.stampsOf([settlementId]);
        const known = stamps.map((s) => memory.get(s.id));
        if (known.every((r, i) => r !== undefined && matches(r, stamps[i]))) {
          return known as VillageRecord[];
        }
      }
      const list = await inner.listBySettlement(settlementId);
      for (const record of list) remember(record);
      return list;
    },
    async create(settlementId, name, state) {
      return remember(await inner.create(settlementId, name, state));
    },
    async findByOrigin(origin) {
      return remember(await inner.findByOrigin(origin));
    },
    async addOnce(settlementId, name, state) {
      return remember(await inner.addOnce(settlementId, name, state));
    },
    async save(villageId, state, expectedVersion, yearRows) {
      const saved = await inner.save(villageId, state, expectedVersion, yearRows);
      if (saved) remember(saved);
      else records()?.delete(villageId);
      return saved;
    },
    async rename(villageId, name) {
      records()?.delete(villageId);
      return inner.rename(villageId, name);
    },
    stampsOf: (settlementIds) => inner.stampsOf(settlementIds),
    // souhrn je malý a v úložišti vždy k uložené verzi – paměť ho nedrží
    digestsOf: (villageIds) => inner.digestsOf(villageIds),
    weatherSeedOf: (settlementId) => inner.weatherSeedOf(settlementId),
    // schránka se nepamatuje – zápis zvedá verzi vsi, takže zapamatovaný záznam neprojde otiskem
    inbox: inner.inbox,
    ...(inner.holds ? { holds: inner.holds } : {}),
  };
}
