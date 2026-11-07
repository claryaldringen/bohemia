// `npm run test:db:create` – založí testovací databázi `TEST_DATABASE` (výchozí bohemia_test),
// když neexistuje, a zmigruje ji. `test:db` i e2e to dělají samy před během.
import { prepareTestDatabase } from '../src/test-database';

const url = await prepareTestDatabase();
console.log(`Testovací databáze připravená: ${url}`);
