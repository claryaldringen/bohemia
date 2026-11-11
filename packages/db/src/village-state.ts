// Stav vsi v tabulce `village` mimo adaptér – kodek a přímé SQL pro e2e a měřicí skripty
// (`@bohemia/db/village-state`; bez Drizzlu a bez připojení k databázi při importu).
export {
  LAND,
  decodeVillageState,
  encodeVillageState,
  type EncodedVillageState,
  type LandSpec,
} from './adapters/village-state-codec';
export {
  VILLAGE_STATE_SQL_COLUMNS,
  readVillageState,
  storedVillageState,
  updateVillageState,
  villageDerivedColumns,
  villageStateOfSqlRow,
  villageStateSelect,
  villageStateSizeSql,
  villageStateSqlValues,
  writeVillageState,
  type SqlClient,
  type StoredVillageState,
  type VillageDerivedColumns,
  type VillageStateSqlRow,
} from './adapters/village-state-row';
