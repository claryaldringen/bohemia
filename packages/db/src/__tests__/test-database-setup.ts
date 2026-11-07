import { prepareTestDatabase } from '../test-database';

/** globalSetup `test:db` – testovací databáze `TEST_DATABASE` musí existovat a mít migrace. */
export default async function setup(): Promise<void> {
  await prepareTestDatabase();
}
