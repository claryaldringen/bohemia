import type { QueryResult, QueryResultRow } from 'pg';
import {
  isVillageAbandoned,
  isVillageExtinct,
  villageDigest,
  type VillageDigest,
  type VillageState,
} from '@bohemia/game';
import { decodeVillageState, encodeVillageState } from './village-state-codec';

// Řádek tabulky `village` a stav vsi: odvozené sloupce, čtení starého i nového tvaru a přímé SQL
// pro e2e a měřicí skripty (docs/code/village-core.md – Uložení stavu vsi). Adaptér
// (village-repository.ts) i přímé SQL zapisují stav stejně – kodekem, s odvozenými sloupci.

/** Sloupce odvozené ze stavu – zapisují se s každým stavem (zdroj pravdy je stav). */
export interface VillageDerivedColumns {
  lastDay: number;
  asleep: boolean;
  origin: string | null;
  refugeRefId: string | null;
  refugeHostVillageId: string | null;
  digest: VillageDigest;
}

export function villageDerivedColumns(state: VillageState): VillageDerivedColumns {
  return {
    lastDay: state.lastDay,
    asleep: isVillageExtinct(state) || isVillageAbandoned(state),
    origin: state.origin ?? null,
    refugeRefId: state.refuge?.refId ?? null,
    refugeHostVillageId: state.refuge?.hostVillageId ?? null,
    digest: villageDigest(state),
  };
}

/** Uložený stav – nový tvar (`state_day` + `state_land`), nebo starý jsonb `state`. */
export interface StoredVillageState {
  state: VillageState | null;
  stateDay: Uint8Array | null;
  stateLand: Uint8Array | null;
}

/** Stav z řádku – líný převod: ves bez `state_day` se čte ze starého jsonb. */
export function storedVillageState(row: StoredVillageState): VillageState {
  if (row.stateDay !== null) return decodeVillageState(row.stateDay, row.stateLand);
  if (row.state !== null) return row.state;
  throw new Error('Ves bez uloženého stavu.');
}

// ---------------------------------------------------------------------------------------------
// Přímé SQL (node-postgres) – e2e pomocníci a měřicí skripty, mimo hexagon.

/** Klient node-postgres (`Client`, `PoolClient`, `Pool`). */
export interface SqlClient {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

/** Sloupce stavu vsi pro kopii řádku (`INSERT INTO village (…) SELECT … FROM village`). */
export const VILLAGE_STATE_SQL_COLUMNS =
  'state, state_day, state_land, land_hash, last_day, asleep, origin, refuge_ref_id, ' +
  'refuge_host_village_id';

/** Sloupce pro čtení stavu (`SELECT ${villageStateSelect('v')} FROM village v`). */
export function villageStateSelect(alias?: string): string {
  const a = alias ? `${alias}.` : '';
  return `${a}state AS state, ${a}state_day AS state_day, ${a}state_land AS state_land`;
}

/** Velikost uloženého stavu v bajtech – řazení „největší ves“ v měřicích skriptech. */
export function villageStateSizeSql(alias?: string): string {
  const a = alias ? `${alias}.` : '';
  return (
    `(coalesce(pg_column_size(${a}state), 0) + coalesce(pg_column_size(${a}state_day), 0) + ` +
    `coalesce(pg_column_size(${a}state_land), 0))`
  );
}

/** Řádek s výsledkem `villageStateSelect`. */
export interface VillageStateSqlRow {
  state: VillageState | null;
  state_day: Buffer | null;
  state_land: Buffer | null;
}

export function villageStateOfSqlRow(row: VillageStateSqlRow): VillageState {
  return storedVillageState({
    state: row.state,
    stateDay: row.state_day,
    stateLand: row.state_land,
  });
}

/** Stav vsi podle id (null = ves neexistuje). */
export async function readVillageState(
  client: SqlClient,
  villageId: string,
): Promise<VillageState | null> {
  const { rows } = await client.query<VillageStateSqlRow>(
    `SELECT ${villageStateSelect()} FROM village WHERE id = $1`,
    [villageId],
  );
  return rows[0] ? villageStateOfSqlRow(rows[0]) : null;
}

/**
 * Hodnoty sloupců stavu pro přímé SQL v pořadí `VILLAGE_STATE_SQL_COLUMNS` (zem vždy celá – přímé
 * SQL není horká cesta).
 */
export function villageStateSqlValues(state: VillageState): unknown[] {
  const encoded = encodeVillageState(state);
  const derived = villageDerivedColumns(state);
  return [
    null,
    encoded.day,
    encoded.land(),
    encoded.landHash,
    derived.lastDay,
    derived.asleep,
    derived.origin,
    derived.refugeRefId,
    derived.refugeHostVillageId,
  ];
}

/**
 * Zapíše stav vsi jako server (kodek, odvozené sloupce, souhrn) a zvedne `version` – rozběhnutý
 * dopočet pak narazí na konflikt verze. Vrátí false, když ves neexistuje.
 */
export async function writeVillageState(
  client: SqlClient,
  villageId: string,
  state: VillageState,
): Promise<boolean> {
  const derived = villageDerivedColumns(state);
  const result = await client.query(
    `UPDATE village SET (${VILLAGE_STATE_SQL_COLUMNS}) = ($2, $3, $4, $5, $6, $7, $8, $9, $10),
       digest = $11::jsonb, digest_version = version + 1, version = version + 1, updated_at = now()
     WHERE id = $1`,
    [villageId, ...villageStateSqlValues(state), JSON.stringify(derived.digest)],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Atomická úprava stavu vsi (`SELECT … FOR UPDATE` v transakci) – náhrada za `jsonb_set` přímo
 * v SQL. Klient musí být jedno spojení (`Client`, `PoolClient`). Vrátí upravený stav.
 */
export async function updateVillageState(
  client: SqlClient,
  villageId: string,
  change: (state: VillageState) => VillageState,
): Promise<VillageState> {
  await client.query('BEGIN');
  try {
    const { rows } = await client.query<VillageStateSqlRow>(
      `SELECT ${villageStateSelect()} FROM village WHERE id = $1 FOR UPDATE`,
      [villageId],
    );
    if (!rows[0]) throw new Error(`Ves ${villageId} neexistuje.`);
    const next = change(villageStateOfSqlRow(rows[0]));
    await writeVillageState(client, villageId, next);
    await client.query('COMMIT');
    return next;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
