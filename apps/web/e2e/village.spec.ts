import { test, expect } from '@playwright/test';
import {
  buyPrice,
  dateOfDayIndex,
  dayIndexOf,
  getWorldState,
  cemeteryPartsFromCells,
  neighbourOf,
  sellPrice,
  villageGoodStock,
  clearingFellCost,
  fellDueTrees,
  foundField,
  fieldPartsFromCells,
  generateLandscapeAttempt,
  orchardPartsFromCells,
  penSquaresFromCells,
  placementVillageOf,
  suggestVillageName,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type LayerVersions,
  type PlacementVillage,
  type Position,
  type Road,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import { openGameMenu, useUniqueClientIp } from './helpers';
import {
  block,
  confirmPlacement,
  found,
  freeHomes,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  seat,
  selectAllDwellings,
  twoHouseholds,
  villageSpots,
  villageOnNextMap,
  villageState,
  withBuiltFirstDwelling,
  writeVillageState,
} from './village-helpers';

// Ves projde celou cestou hráče (rozhraní jako v 0 A.D., server actions, scéna) – jen kliknutí
// do 3D scény při umisťování nahrazuje testovací háček `window.__bohemiaE2E.confirmPlacement`
// (lib/e2e-hooks.ts, jen v buildu s NEXT_PUBLIC_E2E_HOOKS=1). Krajina nového hráče je náhodná
// a bezhlavý prohlížeč kreslí softwarově – volná místa pro stavby proto test spočítá předem ze
// seedu krajiny v databázi stejnými pravidly, jaká používá hra.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  // Bez modelů stromů naběhne softwarově kreslená scéna rychleji (viz landscape.spec.ts).
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 120_000 });

/** Nejbližší čtverec ke zemnici, kam smí hřbitov (blízkost obydlí jen varuje). */
function cemeterySpot(l: Landscape, dwelling: Position): TileCell {
  const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
  if (!tile) throw new Error('Zemnice leží mimo krajinu.');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: dwelling }],
    constructions: [],
    parts: [],
  };
  for (let r = 2; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cell = { x: tile.x + dx, y: tile.y + dy };
        if (cemeteryPartsFromCells(l, village, [cell], [dwelling]).check.ok) return cell;
      }
    }
  }
  throw new Error('U zemnice není místo pro hřbitov.');
}

/** Nejbližší dva čtverce ke zemnici (vedle sebe), kam smí sad – staví se jako pole. */
function orchardSpot(l: Landscape, dwelling: Position): TileCell[] {
  const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
  if (!tile) throw new Error('Zemnice leží mimo krajinu.');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: dwelling }],
    constructions: [],
    parts: [],
  };
  for (let r = 2; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cells = block(tile.x + dx, tile.y + dy, 2, 1);
        if (orchardPartsFromCells(l, village, cells, [dwelling]).check.ok) return cells;
      }
    }
  }
  throw new Error('U zemnice není místo pro sad.');
}

/**
 * Pole 3 × 2 čtverce co nejblíž zemnici aspoň s jedním čtvercem v lese, na kterém stojí stromy –
 * `forest` je ten čtverec.
 */
function forestFieldSpot(
  l: Landscape,
  state: VillageState,
  dwelling: Position,
): { forest: TileCell; parts: ReturnType<typeof fieldPartsFromCells>['parts'] } {
  const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
  if (!tile) throw new Error('Zemnice leží mimo krajinu.');
  const village = placementVillageOf(state, state.lastDay);
  for (let r = 2; r <= 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cells = block(tile.x + dx, tile.y + dy, 3, 2);
        if (!cells.some((c) => surfaceAt(l, c.x, c.y) === 'forest')) continue;
        const preview = fieldPartsFromCells(l, village, cells, [dwelling]);
        const forest = preview.parts.find((part) => (part.standing?.length ?? 0) > 0)?.cell;
        if (forest && preview.blockedCells.length === 0 && preview.parts.length === cells.length) {
          return { forest, parts: preview.parts };
        }
      }
    }
  }
  throw new Error('U zemnice není les pro pole.');
}

test('nový hráč založí ves umístěním zemnice, přejmenuje ji a vybere zemnici', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'ves');
  const grid = page.getByTestId('build-grid');
  // Bez průvodce: dokud ves není, nabídka má jen zemnici a žádný popis kroků.
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(page.getByText(/Založ ves|Vyznač první pole/)).toHaveCount(0);
  const spots = villageSpots(s.landscape);

  await found(page, spots.dwelling);
  const name = page.getByTestId('village-name');
  await expect(name).toHaveText(suggestVillageName(s.seed));
  await expect(grid.getByRole('button')).toHaveCount(14);
  // Nové obydlí ani dílnu nemá kdo osídlit – zakladatelé si stavějí vlastní zemnici. Hřbitov,
  // sad, modla, svatyně ani ohrada lidi nechtějí (modla a svatyně dospělé duby, ohrada stromy –
  // krajina je má).
  await expect(grid.getByRole('button', { name: 'Polozemnice' })).toBeDisabled();
  for (const craft of ['Hrnčíř', 'Kovář', 'Uhlíř', 'Tesař']) {
    await expect(grid.getByRole('button', { name: craft })).toBeDisabled();
  }
  await expect(grid.getByRole('button', { name: 'Hřbitov' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Sad' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Modla' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Svatyně' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Ohrada' })).toBeEnabled();
  // štěstí obyvatel v horní liště (happiness.md) – výchozí kolem 50
  await expect(page.getByTestId('village-happiness')).toHaveText(/^\d+$/);
  expect((await villageState(s.settlementId)).fields).toEqual([]);

  // Jméno se přepíše přímo v horní liště (tužka vedle jména – klik na jméno přepíná vsi).
  await page.getByRole('button', { name: 'Přejmenovat ves' }).click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Testovice');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Testovice');

  // Zemnici si osadníci teprve staví – v uložené vsi je to stavba, obydlí zatím žádné.
  const founded = await villageState(s.settlementId);
  expect(founded.dwellings).toEqual([]);
  expect(founded.constructions).toEqual([
    expect.objectContaining({
      kind: 'dwelling',
      dwellingType: 'zemnice',
      position: spots.dwelling,
    }),
  ]);

  // R vrátí pohled na ves, kliknutí na zemnici ji vybere – panel ukáže průběh stavby.
  await page.keyboard.press('r');
  const point = await page.evaluate(
    (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
    spots.dwelling,
  );
  expect(point).not.toBeNull();
  const clickZemnice = async (): Promise<void> => {
    await page.mouse.move(point!.x - 3, point!.y);
    await page.mouse.click(point!.x, point!.y);
  };
  await clickZemnice();
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'site');
  const progress = Number(
    await panel.getByTestId('selection-progress').getAttribute('aria-valuenow'),
  );
  expect(progress).toBeLessThan(100);
  // Pravé tlačítko výběr zruší (jako v 0 A.D.).
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await expect(panel).toHaveCount(0);

  // Dostavěná zemnice (i ves uložená dřív se zemnicí od založení): osadníci v ní bydlí.
  await writeVillageState(s.settlementId, withBuiltFirstDwelling(founded));
  await pollVillage(page);
  await expect
    .poll(
      async () => {
        await clickZemnice();
        return panel.getAttribute('data-kind');
      },
      { timeout: 20_000 },
    )
    .toBe('dwelling');
  // ves zakládá vojvoda s hlavní a třemi vedlejšími manželkami (lord.md – Zakladatelé)
  await expect(panel.getByTestId('selection-occupants')).toHaveText('5/6');
  // zemnice zakladatelů je dvorec – obyvatelé jako rodina; dovednosti jen v panelu osoby (lord.md)
  await expect(panel.getByTestId('selection-residents').getByRole('listitem')).toHaveCount(5);
  await expect(
    panel.getByTestId('selection-residents').locator('[data-testid^="manor-arms-"]'),
  ).toHaveCount(0);
  // klik na portrét vojvody vybere osobu a otevře panel osoby
  await panel
    .getByTestId('selection-residents')
    .getByRole('button', { name: /Vojvoda/ })
    .first()
    .click();
  await expect(panel).toHaveAttribute('data-kind', 'person');

  // Ves je uložená na serveru – po novém načtení stránky je tu dál i s novým jménem.
  await page.reload();
  await expect(page.getByTestId('village-name')).toHaveText('Testovice', { timeout: 30_000 });
});

test('jména rodu – vojvoda před první zemnicí, syn bez jména čeká upozorněním', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'jmena');
  const spots = villageSpots(s.landscape);
  // Bez vsi se nejdřív pojmenuje vojvoda – zemnice počká (lord.md – Kde se jméno zadává).
  const panel = page.getByTestId('line-name-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveAttribute('data-lord', 'true');
  await expect(
    page.getByTestId('build-grid').getByRole('button', { name: 'Zemnice' }),
  ).toBeDisabled();
  const input = panel.getByTestId('line-name-input');
  const confirm = panel.getByTestId('line-name-confirm');
  // Jen písmena – důvod u kurzoru (popisek fajfky), fajfka zašedlá.
  await input.fill('Bořivoj1');
  await expect(confirm).toBeDisabled();
  await confirm.hover({ force: true });
  await expect(
    panel.getByRole('tooltip').filter({ hasText: 'Jen písmena.' }).first(),
  ).toBeVisible();
  // Kostka navrhne jméno ze seznamu rodu.
  await panel.getByTestId('line-name-dice').click();
  await expect(input).toHaveValue(/^\p{L}+$/u);
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('line-name-panel.png'), scale: 'css' });
  await input.fill('Mrdomír');
  await input.press('Enter');
  await expect(panel).toHaveCount(0);

  await found(page, spots.dwelling, null);
  const founded = await villageState(s.settlementId);
  const lordId = founded.dynasty!.lordId!;
  expect(founded.people.find((p) => p.id === lordId)?.name).toBe('Mrdomír');
  // Jméno v panelu vojvody – první řádek nad rolí, popisek portrétu „Mrdomír – Vojvoda“.
  await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), lordId);
  const selection = page.getByTestId('selection-panel');
  await expect(selection.getByTestId('selection-person-name')).toHaveText('Mrdomír');
  await expect(selection).toContainText('Mrdomír – Vojvoda');

  // Syn vojvody bez jména (narodil se hlavní manželce) – trvalé upozornění, klik otevře panel.
  const lord = founded.people.find((p) => p.id === lordId)!;
  const sonId = Math.max(...founded.people.map((p) => p.id)) + 1;
  const son: VillageState['people'][number] = {
    ...lord,
    id: sonId,
    bornDay: founded.lastDay - 8 * 365,
    fatherId: lordId,
    motherId: lord.spouseId!,
    mainWifeSon: true,
  };
  delete son.name;
  delete son.spouseId;
  delete son.arms;
  founded.people.push(son);
  await writeVillageState(s.settlementId, founded);
  await pollVillage(page);
  const notice = page.getByTestId('pinned-notice');
  await expect(notice).toHaveText('Syn vojvody čeká na jméno', { timeout: 20_000 });
  await notice.click();
  await expect(panel).toHaveAttribute('data-lord', 'false');
  await input.fill('Ctibor');
  await input.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(notice).toHaveCount(0, { timeout: 20_000 });
  const named = await villageState(s.settlementId);
  expect(named.people.find((p) => p.id === sonId)?.name).toBe('Ctibor');
  expect(named.chronicle.at(-1)).toMatchObject({ kind: 'line-named', name: 'Ctibor', who: 'son' });
  await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), sonId);
  await expect(selection.getByTestId('selection-person-name')).toHaveText('Ctibor');
  await expect(selection).toContainText('Ctibor – Syn vojvody');
});

test('psaní jména vojvody nespouští zkratky hry a mimo pole nejde založit ves', async ({
  page,
}) => {
  await newPlayer(page, 'psani');
  const panel = page.getByTestId('line-name-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const input = panel.getByTestId('line-name-input');
  const zemnice = page.getByTestId('build-grid').getByRole('button', { name: 'Zemnice' });
  // Písmeno zkratky (Z = zemnice), mezera, šipky i Ctrl + A zůstanou v poli.
  await input.fill('');
  await input.press('KeyZ');
  await input.press('Space');
  await input.press('KeyB');
  await input.press('ArrowLeft');
  await input.press('ArrowRight');
  await input.press('Control+A');
  await input.press('End');
  await expect(input).toHaveValue('z b');
  await expect(zemnice).toHaveAttribute('aria-pressed', 'false');
  // Zkratka stavby po kliku mimo pole nezačne umisťovat zemnici, dokud vojvoda nemá jméno.
  await page.mouse.click(10, 300);
  await page.keyboard.press('z');
  await expect(zemnice).toHaveAttribute('aria-pressed', 'false');
  await expect(panel).toBeVisible();
});

test('obydlí jde stavět, jen když je kým ho osadit – pole kdykoli', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'stavby');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const polozemnice = grid.getByRole('button', { name: 'Polozemnice' });

  // Lidé k osídlení nejsou: tlačítko zašedlé, v popisku chybějící lidé červeně, zkratka nic.
  await expect(polozemnice).toBeDisabled();
  await expect(grid.getByRole('button', { name: 'Zemnice', exact: true })).toBeDisabled();
  await polozemnice.hover();
  const settlers = grid
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Polozemnice' }) })
    .locator('[data-resource="settlers"]');
  await expect(settlers).toBeVisible();
  await expect(settlers).toHaveAttribute('data-missing', 'true');
  await page.mouse.move(10, 300);
  await page.keyboard.press('x');
  await expect(polozemnice).toHaveAttribute('aria-pressed', 'false');

  // Pole klávesovou zkratkou C, kdykoli po založení.
  await page.keyboard.press('c');
  await expect(grid.getByRole('button', { name: 'Pole' })).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);

  // Zemnice dostavěná (R pak vrací pohled na první obydlí, ne na místo vsi) a její zakladatelé
  // dospělí a jeden dospělý navíc – z domácnosti smí odejít jediná rodina (Lidé k osídlení,
  // kinship.md: pár, který dům nedrží, smí odejít kdykoli), tedy jedno nové obydlí.
  const full = withBuiltFirstDwelling(await villageState(s.settlementId));
  const adultBorn = full.lastDay - Math.ceil(16 * 365.25);
  for (const person of full.people) person.bornDay = Math.min(person.bornDay, adultBorn);
  full.people.push({
    id: full.nextId++,
    bornDay: adultBorn,
    dwellingId: full.people[0]!.dwellingId,
  });
  await writeVillageState(s.settlementId, full);
  await pollVillage(page);
  // Pohled vsi už vidí dostavěné obydlí – R teprve pak vrací pohled na něj.
  await expect(polozemnice).toBeEnabled({ timeout: 20_000 });

  // Klik na čtverec pole vybere jen díl, dvojklik celé pole (fields.md – Co hráč vidí); čtverec
  // nejdál od zemnice, ať klik nezachytí střecha.
  // Myš u okraje obrazovky posouvá kameru (okrajové rolování) – po klávese X zůstala vlevo.
  await page.mouse.move(640, 360);
  await page.keyboard.press('r');
  const fieldCenter = spots.cells
    .map((cell) => tileCenterWorld(s.landscape, cell.x, cell.y))
    .sort(
      (a, b) =>
        Math.hypot(b.x - spots.dwelling.x, b.z - spots.dwelling.z) -
        Math.hypot(a.x - spots.dwelling.x, a.z - spots.dwelling.z),
    )[0]!;
  // Kamera po R plynule přejíždí na ves – počkat, až se bod na obrazovce ustálí.
  let lastPoint = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(
          await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), fieldCenter),
        );
        const settled = now !== 'null' && now === lastPoint;
        lastPoint = now;
        return settled;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const fieldPoint = JSON.parse(lastPoint) as { x: number; y: number };
  const panel = page.getByTestId('selection-panel');
  await page.mouse.move(fieldPoint.x - 3, fieldPoint.y);
  await page.mouse.click(fieldPoint.x, fieldPoint.y);
  await expect(panel).toHaveAttribute('data-kind', 'field-part');
  await expect(panel.getByTestId('selection-area')).toHaveText(/ m²$/);
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await page.mouse.dblclick(fieldPoint.x, fieldPoint.y);
  await expect(panel).toHaveAttribute('data-kind', 'field');
  await expect(panel.getByTestId('selection-area')).toHaveText(/ ha$/);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await polozemnice.click();
  await expect(polozemnice).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, {
    kind: 'dwelling',
    type: 'polozemnice',
    position: spots.second.position,
    plot: spots.second.plot,
  });
  await expect
    .poll(async () => {
      const state = await villageState(s.settlementId);
      return state.constructions.filter((c) => c.kind === 'dwelling').map((c) => c.dwellingType);
    })
    .toEqual(['polozemnice']);
  // Jediný pár čeká na rozestavěnou polozemnici – další obydlí zase nejde.
  await expect(polozemnice).toBeDisabled();
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
});

test('upozornění vsi se ukáže krátkým řádkem nahoře a samo zmizí', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'upozorneni');
  await found(page, villageSpots(s.landscape).dwelling);
  // Hlad nastavený přímo v uložené vsi – další dotaz na ves ho ohlásí. „Ves hladoví“ je stupeň
  // s příděl pod 90 % (population.md – Co hráč vidí); samotný příznak `hungry` je jen šetření.
  await query(
    `UPDATE village SET state = state || '{"hungry": true, "ration": 0.5}'::jsonb, version = version + 1
      WHERE settlement_id = $1`,
    [s.settlementId],
  );
  await pollVillage(page);
  const notice = page.locator('[data-testid="village-notice"][data-kind="hungry"]');
  await expect(notice).toHaveText('Ves hladoví', { timeout: 20_000 });
  await expect(notice).toHaveCount(0, { timeout: 15_000 });
});

test('hráč založí hřbitov po čtvercích a vybere ho – panel ukáže hroby', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'hrbitov');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const cell = cemeterySpot(s.landscape, spots.dwelling);

  // Hřbitov klávesovou zkratkou V, malování po čtvercích jako pole.
  await page.keyboard.press('v');
  await expect(grid.getByRole('button', { name: 'Hřbitov' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await confirmPlacement(page, { kind: 'squares', cells: [cell] });
  await expect
    .poll(async () => (await villageState(s.settlementId)).cemeteries?.length ?? 0)
    .toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Kliknutí na čtverec hřbitova ho vybere – nehotový ukáže jen průběh založení.
  await page.keyboard.press('r');
  const center = tileCenterWorld(s.landscape, cell.x, cell.y);
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), center);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'cemetery');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();

  // Ohrazený hřbitov se třemi hroby přímo v uložené vsi – další dotaz ho ukáže.
  const state = await villageState(s.settlementId);
  const cemetery = state.cemeteries![0]!;
  cemetery.builtDay = state.lastDay;
  cemetery.graves = 3;
  state.constructions = state.constructions.filter((c) => c.kind !== 'cemetery');
  await query('UPDATE village SET state = $2, version = version + 1 WHERE settlement_id = $1', [
    s.settlementId,
    JSON.stringify(state),
  ]);
  await pollVillage(page);
  await expect(panel.getByTestId('selection-graves')).toHaveText('3/56', { timeout: 20_000 });
  await expect(panel.getByTestId('selection-years')).toBeVisible();
});

test('panel cesty ukáže oba konce – klik na napojenou cestu ji vybere, konec nikam varuje', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'konce-cesty');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  // Dvě upravené cesty u vsi (úklid je nesmaže): A končí na B bez křižovatky, jinak nikam.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const { x, z } = spots.dwelling;
  const roadOf = (id: number, points: Road['points']): Road => ({
    id,
    points,
    bornDay: state.lastDay,
    grade: 'improved',
    traffic: [],
    spots: [],
  });
  const a = state.nextId++;
  const b = state.nextId++;
  state.roads = {
    ...(state.roads ?? { roads: [] }),
    roads: [
      roadOf(a, [
        { x: x + 20, z: z + 20 },
        { x: x + 20, z: z + 60 },
      ]),
      roadOf(b, [
        { x: x, z: z + 62 },
        { x: x + 40, z: z + 62 },
      ]),
    ],
  } as VillageState['roads'];
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  await page.evaluate((id) => window.__bohemiaE2E!.selectRoad!(id), a);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'road');
  const start = panel.getByTestId('selection-road-end-0');
  const end = panel.getByTestId('selection-road-end-1');
  await expect(start).toHaveAttribute('data-end-kind', 'none');
  await expect(start).toHaveAttribute('aria-label', 'Cesta tu nikam nevede.');
  await expect(end).toHaveAttribute('aria-label', 'Cesta končí na jiné cestě bez křižovatky.');
  await expect(page.locator('[data-end-kind="road"][data-alert]')).toHaveCount(1);
  // Klik na konec vybere napojenou cestu B – ta nikam nevede na žádném konci.
  await end.click();
  await expect(panel.getByTestId('selection-road-end-1')).toHaveAttribute('data-end-kind', 'none');
});

test('hráč postaví ohradu koní z rozcestníku ohrad – panel ukáže koně, místa a obilí', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'kone');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: spots.dwelling }],
    constructions: [],
    parts: [],
  };
  const tile = tileOfWorldPoint(s.landscape, spots.dwelling.x, spots.dwelling.z)!;
  const cell = [3, 4, 5, 6]
    .flatMap((r) => [
      { x: tile.x + r, y: tile.y },
      { x: tile.x - r, y: tile.y },
      { x: tile.x, y: tile.y + r },
      { x: tile.x, y: tile.y - r },
    ])
    .find((c) => penSquaresFromCells(s.landscape, village, [c], 'horse').check.ok);
  expect(cell).toBeDefined();

  // Koně nové ohrady se platí z přebytku vsi (horses.md – Koně se stavbou ohrady) – nová ves
  // přebytek nemá, dostane hřivny (≈ 130 kg na hodnotu koní).
  const founded = await villageState(s.settlementId);
  founded.crafts = { charcoalKg: 0, potteryKg: 0, ...founded.crafts, ironBarsKg: 200 };
  await writeVillageState(s.settlementId, founded);
  await pollVillage(page);

  // Rozcestník ohrad (O) nabízí i Ohradu koní – druh z mřížky staveb.
  await page.keyboard.press('o');
  const horsePen = grid.getByRole('button', { name: 'Ohrada koní' });
  await expect(horsePen).toBeVisible();
  await horsePen.click();
  await confirmPlacement(page, { kind: 'squares', cells: [cell!], variant: 'horse' });
  await expect
    .poll(async () => (await villageState(s.settlementId)).pens?.[0]?.species)
    .toBe('horse');

  // Hotová ohrada se dvěma koněm v uložené vsi – panel: koně / místa, obilí a seno na zimu.
  const state = await villageState(s.settlementId);
  const pen = state.pens![0]!;
  pen.builtDay = state.lastDay;
  pen.horses = [
    { id: 1, bornDay: state.lastDay - 3000, sex: 'male', training: 50 },
    { id: 2, bornDay: state.lastDay - 2300, sex: 'female', training: 0 },
  ];
  state.constructions = state.constructions.filter((c) => c.kind !== 'pen');
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  await page.keyboard.press('r');
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), pen);
  expect(point).not.toBeNull();
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(point!.x - 3, point!.y);
        await page.mouse.click(point!.x, point!.y);
        return panel.getAttribute('data-kind');
      },
      { timeout: 20_000 },
    )
    .toBe('pen');
  await expect(panel.getByTestId('selection-pen-animals')).toHaveText('2/4', { timeout: 20_000 });
  await expect(panel.getByTestId('selection-horses-grain')).toHaveText('1,5');
  await expect(panel.getByTestId('selection-horses-hay')).toBeVisible();
  await expect(panel.getByTestId('selection-horse-1')).toHaveText('8');
});

test('hráč vysadí sad po čtvercích a vybere ho – panel ukáže výsadbu, stáří a úrodu', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'sad');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const cells = orchardSpot(s.landscape, spots.dwelling);

  // Sad klávesovou zkratkou B, malování po čtvercích jako pole.
  await page.keyboard.press('b');
  await expect(grid.getByRole('button', { name: 'Sad' })).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, { kind: 'squares', cells });
  await expect.poll(async () => (await villageState(s.settlementId)).orchards?.length ?? 0).toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Kliknutí na čtverec sadu vybere jen ten čtverec (fields.md – Co hráč vidí) – sází se, úroda 0.
  await page.keyboard.press('r');
  const center = tileCenterWorld(s.landscape, cells[0]!.x, cells[0]!.y);
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), center);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'orchard-square');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await expect(panel.getByTestId('selection-yield')).toHaveText('0');
  // Dvojklik vybere celý sad – sázející se sad ukáže průběh výsadby a odhad úrody.
  await page.mouse.dblclick(point!.x, point!.y);
  await expect(panel).toHaveAttribute('data-kind', 'orchard');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await expect(panel.getByTestId('selection-yield')).toHaveText('0');

  // Sad vysazený před 30 lety přímo v uložené vsi – další dotaz ho ukáže v plné
  // úrodě: 2 čtverce = 0,045 ha × 3 t = 135 kg jablek.
  const state = await villageState(s.settlementId);
  const orchard = state.orchards![0]!;
  for (const square of orchard.squares) {
    square.plantedDay = state.lastDay - Math.ceil(30 * 365.25);
    square.plantingDone = square.plantingCost;
    delete square.obstacles;
    delete square.trees;
  }
  state.constructions = state.constructions.filter((c) => c.kind !== 'orchard');
  await query('UPDATE village SET state = $2, version = version + 1 WHERE settlement_id = $1', [
    s.settlementId,
    JSON.stringify(state),
  ]);
  await pollVillage(page);
  await expect(panel.getByTestId('selection-age')).toHaveText(/^(29|30)$/, { timeout: 20_000 });
  await expect(panel.getByTestId('selection-progress')).toHaveCount(0);
  await expect(panel.getByTestId('selection-yield')).not.toHaveText('0');
});

test('pole v lese ve fázi pálení – panel dílu ukáže oheň', async ({ page }) => {
  const { email, seat: s } = await newPlayer(page, 'paseka');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // Paseka se pálí jen březen–říjen (forest.md – Klučení lesa pro pole) – mimo okno posun času
  // hráče na 15. 4. (player_time_offset jako šipky vývojového režimu).
  let state = await villageState(s.settlementId);
  const today = dateOfDayIndex(state.lastDay);
  if (today.month < 3 || today.month > 10) {
    const april = dayIndexOf({ year: today.year + (today.month > 10 ? 1 : 0), month: 4, day: 15 });
    await query(
      `INSERT INTO player_time_offset (player_id, offset_days)
         SELECT id, $2 FROM "user" WHERE email = $1`,
      [email, april - state.lastDay],
    );
    await page.reload();
    await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => (await villageState(s.settlementId)).lastDay, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(april);
    state = await villageState(s.settlementId);
  }

  // Pole v lese přímo v uložené vsi: stromy padly, větve schnou 40 dní – dnes se pálí.
  const { forest, parts } = forestFieldSpot(s.landscape, state, spots.dwelling);
  const day = state.lastDay;
  const next = foundField(state, day, { parts });
  for (const part of next.parts) {
    if (!part.clearing) continue;
    part.foundingDone = clearingFellCost(part);
    fellDueTrees(next, part, day);
    part.clearing.felledDay = day - 40;
  }
  await writeVillageState(s.settlementId, next);
  await page.waitForFunction(() => typeof window.__bohemiaE2E?.pollVillage === 'function');
  await pollVillage(page);

  // Klik na čtverec pole vybere díl – fáze pálení: ikona ohně s popiskem v panelu.
  await page.keyboard.press('r');
  const panel = page.getByTestId('selection-panel');
  const center = tileCenterWorld(s.landscape, forest.x, forest.y);
  // les bývá mimo záběr – kamera k němu klikem do minimapy (sever nahoře)
  const minimap = (await page.getByTestId('minimap').boundingBox())!;
  const extent = s.landscape.size * s.landscape.cellSizeM;
  await page.mouse.click(
    minimap.x + ((center.x + extent / 2) / extent) * minimap.width,
    minimap.y + (1 - (center.z + extent / 2) / extent) * minimap.height,
  );
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          center,
        );
        if (point) await page.mouse.click(point.x, point.y);
        // bez výběru panel chybí – nečekat na něj, kliknout znovu (ves se načítá dotazem)
        return panel.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
      },
      // klik po vteřině – dva rychlé kliky by vybraly celé pole
      { timeout: 20_000, intervals: [1_000] },
    )
    .toBe('field-part');
  const flag = panel.getByTestId('selection-clearing');
  await expect(flag).toHaveAttribute('src', '/icons/resources/fire.png');
  await expect(flag).toHaveAttribute('alt', 'Pálí se paseka');
});

test('porážka ve scéně – mršina a kozlina se nakreslí a jsou připravené ke kreslení', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'porazka');
  await found(page, villageSpots(s.landscape).dwelling);

  // Dnešní rozvrh práce s porážkou a prase ve stádě (jako by ho tak dopočítal server).
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  state.livestock = {
    young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    ...state.livestock,
    herds: { sheep: 0, goat: 0, pig: 1, cow: 0 },
  };
  state.labor = {
    day: state.lastDay,
    shares: [{ activity: 'slaughter', target: { kind: 'village' }, manDays: 2 }],
    slaughterHeads: { pig: 1 },
  };
  await writeVillageState(s.settlementId, state);
  // modely jinak testy přerušují (newPlayer) – porážka se bez nich nenakreslí
  await page.unroute('**/models/**');
  await page.reload();
  await expect
    .poll(
      async () => {
        const meshes = await page.evaluate(() => window.__bohemiaE2E?.slaughterMeshes?.() ?? []);
        const ready = (name: string): boolean => meshes.some((m) => m.name === name && m.ready);
        return ready('slaughter-carcass-pig') && ready('slaughter-trestle-small');
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test('když ves vymře, hra skončí obrazovkou porážky – Začít znovu dá nové sídlo', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'vymreni');
  await found(page, villageSpots(s.landscape).dwelling);
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0);

  // Všichni zemřeli – ves vymřelá přímo v uložené vsi (jako by ji tak dopočítal server).
  const dead = await villageState(s.settlementId);
  dead.people = [];
  dead.extinctDay = dead.lastDay;
  dead.chronicle.push({ day: dead.lastDay, kind: 'village-extinct' });
  await writeVillageState(s.settlementId, dead);
  await page.reload();

  const defeat = page.getByTestId('defeat-screen');
  await expect(defeat).toBeVisible({ timeout: 30_000 });
  await expect(defeat.getByRole('heading', { name: 'Rod vymřel' })).toBeVisible();
  await expect(defeat.getByTestId('defeat-village')).toHaveText(suggestVillageName(s.seed));
  await expect(defeat.getByTestId('defeat-years')).toHaveText('0 let');
  // vymřelá ves nic nestaví – nabídka staveb je prázdná
  await expect(page.getByTestId('build-grid').getByRole('button')).toHaveCount(0);

  // Po úspěchu se stránka načte znovu (nová krajina) – čeká se na novou navigaci.
  const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
  await defeat.getByRole('button', { name: 'Začít znovu' }).click();
  await reloaded;
  // Nové sídlo s novou krajinou: zase jen zemnice k založení vsi, bez jména a porážky.
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0, { timeout: 30_000 });
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  const grid = page.getByTestId('build-grid');
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(grid.getByRole('button', { name: 'Zemnice' })).toBeVisible();
  await expect(page.getByTestId('village-name')).toHaveCount(0);

  const fresh = await seat(email);
  expect(fresh.settlementId).not.toBe(s.settlementId);
  const [old] = await query<{ archived: boolean; is_seat: boolean }>(
    'SELECT archived_at IS NOT NULL AS archived, is_seat FROM settlement WHERE id = $1',
    [s.settlementId],
  );
  expect(old).toEqual({ archived: true, is_seat: false });
  // vymřelá ves zůstala v archivu u starého sídla
  expect((await villageState(s.settlementId)).extinctDay).toBe(dead.extinctDay);
  expect(
    await query('SELECT 1 FROM village WHERE settlement_id = $1', [fresh.settlementId]),
  ).toEqual([]);
});

test('když vymře rod po meči, hra skončí kronikou rodu – Začít znovu předvyplní jméno', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'konec-rodu');
  await found(page, villageSpots(s.landscape).dwelling, 'Ctibor');
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0);

  // Zemřeli všichni muži rodu, ženy zůstaly – rod skončil přímo v uložené vsi (jako by ho tak
  // dopočítal server; lord.md – Konec rodu).
  const state = await villageState(s.settlementId);
  const men = new Set(state.people.filter((p) => p.line === true).map((p) => p.id));
  state.people = state.people.filter((p) => !men.has(p.id));
  for (const p of state.people)
    if (p.spouseId !== undefined && men.has(p.spouseId)) delete p.spouseId;
  const dynasty = state.dynasty!;
  dynasty.lords.at(-1)!.toDay = state.lastDay;
  dynasty.lordId = null;
  dynasty.endedDay = state.lastDay;
  state.chronicle.push({ day: state.lastDay, kind: 'line-ended', name: 'Ctibor' });
  expect(state.people.length).toBeGreaterThan(0);
  await writeVillageState(s.settlementId, state);
  await page.reload();

  const defeat = page.getByTestId('defeat-screen');
  await expect(defeat).toBeVisible({ timeout: 30_000 });
  await expect(defeat.getByRole('heading', { name: 'Rod vymřel' })).toBeVisible();
  await expect(defeat.getByTestId('defeat-lords')).toHaveText(/^Ctibor \d+–\d+$/);
  await expect(defeat.getByTestId('defeat-last')).toHaveText('Zemřel Ctibor – poslední muž rodu');
  await expect(defeat.getByTestId('defeat-village')).toHaveText(suggestVillageName(s.seed));
  await expect(defeat.getByTestId('defeat-years')).toHaveText('0 let');
  // ves zanikla – opuštěná ode dne konce rodu, lidé zůstali jako záznam
  const abandoned = await villageState(s.settlementId);
  expect(abandoned.abandonedDay).toBe(state.lastDay);
  expect(abandoned.extinctDay).toBeUndefined();
  expect(abandoned.people.length).toBe(state.people.length);
  expect(abandoned.chronicle.at(-1)).toEqual({
    day: state.lastDay,
    kind: 'village-abandoned',
    reason: 'line-ended',
  });
  await page.screenshot({ path: test.info().outputPath('line-ended.png'), scale: 'css' });

  // Začít znovu – nové sídlo, panel „Jméno vojvody“ předvyplněný jménem zakladatele.
  const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
  await defeat.getByRole('button', { name: 'Začít znovu' }).click();
  await reloaded;
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0, { timeout: 30_000 });
  const panel = page.getByTestId('line-name-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('line-name-input')).toHaveValue('Ctibor');
});

test('nabídka hry (F10) zruší umisťování a Začít znovu se živou vsí po potvrzení dá nové sídlo', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'nabidka');
  await found(page, villageSpots(s.landscape).dwelling);
  const grid = page.getByTestId('build-grid');
  const field = grid.getByRole('button', { name: 'Pole' });
  const menu = page.getByRole('dialog', { name: 'Nabídka' });

  // F10 otevře nabídku jako v 0 A.D. – rozběhnuté umisťování skončí, zkratky staveb neběží.
  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F10');
  await expect(menu).toBeVisible();
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('c');
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  // Esc nabídku zavře, tlačítko v liště ji otevře znovu.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await openGameMenu(page);

  // Se živou vsí jen po potvrzení v panelu – Zrušit vrátí k položkám a nic se nestane.
  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  await expect(menu.getByText('Ves i rod zaniknou, začneš v nové krajině.')).toBeVisible();
  await menu.getByRole('button', { name: 'Zrušit' }).click();
  await expect(menu.getByRole('button', { name: 'Odhlásit' })).toBeVisible();
  expect((await seat(email)).settlementId).toBe(s.settlementId);

  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  await reloaded;
  // Nové sídlo s novou krajinou: zase jen zemnice k založení vsi, bez jména a bez nabídky.
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(menu).toHaveCount(0);
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(grid.getByRole('button', { name: 'Zemnice' })).toBeVisible();
  await expect(page.getByTestId('village-name')).toHaveCount(0);
  // panel jména vojvody znovu, předvyplněný posledním jménem (lord.md – Kde se jméno zadává)
  await expect(page.getByTestId('line-name-input')).toHaveValue('Bořivoj');

  const fresh = await seat(email);
  expect(fresh.settlementId).not.toBe(s.settlementId);
  const [old] = await query<{ archived: boolean; is_seat: boolean }>(
    'SELECT archived_at IS NOT NULL AS archived, is_seat FROM settlement WHERE id = $1',
    [s.settlementId],
  );
  expect(old).toEqual({ archived: true, is_seat: false });
  // opuštěná ves zůstala v archivu, jak byla – nevymřela, jen se dál nedopočítává
  const abandoned = await villageState(s.settlementId);
  expect(abandoned.extinctDay).toBeUndefined();
  expect(abandoned.people.length).toBeGreaterThan(0);
  expect(
    await query('SELECT 1 FROM village WHERE settlement_id = $1', [fresh.settlementId]),
  ).toEqual([]);

  // Bez vsi není co začínat znovu – položka je zamčená.
  await page.keyboard.press('F10');
  await expect(menu.getByRole('button', { name: 'Začít znovu' })).toBeDisabled();
});

test('domácnosti se stěhují do nových domů – Ctrl + A vybere obydlí, domy se umístí postupně', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'stehovani');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // Dvě dostavěná obydlí s domácnostmi (zakladatelé a mladý pár vedle) a klády na hromadě.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const [neighbour] = freeHomes(s.landscape, spots.dwelling, [spots.dwelling], 1);
  const pairHome = state.nextId++;
  state.dwellings.push({
    id: pairHome,
    type: 'zemnice',
    builtDay: state.lastDay,
    condition: 1,
    position: neighbour!,
  });
  const adultBorn = state.lastDay - Math.ceil(20 * 365.25);
  for (let i = 0; i < 2; i++) {
    state.people.push({ id: state.nextId++, bornDay: adultBorn, dwellingId: pairHome });
  }
  state.woodLogs = 30;
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  // Ctrl + A vybere obě obydlí (jakmile dotaz na ves přinese druhé) – panel ukáže domácnosti.
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(10, 300);
        await page.keyboard.press('Control+A');
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 20_000 },
    )
    .toBe('dwellings');
  await expect(panel.getByTestId('selection-households')).toHaveText('2');
  // odchod do nové vsi už jde (migration.md – fáze 3 a 4), testuje ho vlastní test níž
  await expect(panel.getByTestId('leave-village')).toBeEnabled();

  // Přestěhovat do zemnice: nový dům se umístí za každou domácnost, jeden za druhým.
  await panel.getByTestId('relocate-zemnice').click();
  const homes = freeHomes(s.landscape, spots.dwelling, [spots.dwelling, neighbour!], 2);
  for (const position of homes) {
    await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position });
  }
  await expect
    .poll(async () =>
      (await villageState(s.settlementId)).constructions
        .filter((c) => c.relocates !== undefined)
        .map((c) => c.relocates)
        .sort(),
    )
    .toEqual([state.dwellings[0]!.id, pairHome].sort());
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Staveniště nového domu jde zrušit – dřevo se vrátí na hromadu, domácnost zůstane doma.
  await page.keyboard.press('r');
  const point = await page.evaluate(
    (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
    homes[0]!,
  );
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  await expect(panel).toHaveAttribute('data-kind', 'site');
  await panel.getByTestId('cancel-construction').click();
  await expect
    .poll(
      async () =>
        (await villageState(s.settlementId)).constructions.filter((c) => c.relocates !== undefined)
          .length,
    )
    .toBe(1);
});

test('druhá ves na jiné mapě – jméno vsi v liště přepíná mezi vsemi', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'vsi');
  await found(page, villageSpots(s.landscape).dwelling);
  const name = page.getByTestId('village-name');
  const first = suggestVillageName(s.seed);
  await expect(name).toHaveText(first);
  // jedna ves, jedna mapa – vývojové tlačítko druhé vsi na téže mapě už není; druhá ves leží na
  // mapě vedle
  await expect(page.getByTestId('dev-second-village')).toHaveCount(0);
  const [one] = await query<{ id: string }>('SELECT id FROM village WHERE settlement_id = $1', [
    s.settlementId,
  ]);
  const two = await villageOnNextMap(s.settlementId, 'Budeč', { own: true });
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(name).toHaveText(first, { timeout: 30_000 });

  // Klik na jméno otevře seznam vsí (jméno a lidé), klik na ves ji přepne.
  await name.click();
  const list = page.getByTestId('village-list');
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.locator(`[data-village="${one!.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(list.locator(`[data-village="${two.id}"]`)).toContainText('Budeč');
  await list.locator(`[data-village="${two.id}"] [data-testid="village-select"]`).click();
  await expect(list).toHaveCount(0);
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(name).toHaveText('Budeč', { timeout: 30_000 });

  // Přejmenování platí jen pro vybranou ves.
  await page.getByRole('button', { name: 'Přejmenovat ves' }).click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Druhovice');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Druhovice');
  const names = async (): Promise<string[]> =>
    (
      await query<{ name: string }>('SELECT name FROM village WHERE id = ANY($1) ORDER BY name', [
        [one!.id, two.id],
      ])
    ).map((v) => v.name);
  await expect.poll(names, { timeout: 30_000 }).toEqual(['Druhovice', first].sort());

  // Výběr se pamatuje – po novém načtení stránky je vybraná zase druhá ves, pak první.
  await page.reload();
  await expect(name).toHaveText('Druhovice', { timeout: 30_000 });
  await name.click();
  await list.locator(`[data-village="${one!.id}"] [data-testid="village-select"]`).click();
  await expect(name).toHaveText(first, { timeout: 30_000 });
  await page.reload();
  await expect(name).toHaveText(first, { timeout: 30_000 });
});

test('seniorát – v cizí vsi rodu stavební lišta zašedne s důvodem, senior ji smí použít', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'senior');
  await found(page, villageSpots(s.landscape).dwelling);
  const [one] = await query<{ id: string }>('SELECT id FROM village WHERE settlement_id = $1', [
    s.settlementId,
  ]);
  // Hráčovým mužem je vojvoda Budče; v původní vsi (cizí ves rodu) vede ves jiný muž a ten je
  // starší – senior rodu, takže hráč jen sleduje.
  const two = await villageOnNextMap(s.settlementId, 'Budeč', { own: true });
  const older = async (villageId: string, years: number): Promise<void> => {
    await query(
      `UPDATE village SET version = version + 1, state = jsonb_set(state, '{people}',
         (SELECT jsonb_agg(CASE WHEN (p->>'id')::int = (state->'dynasty'->>'lordId')::int
            THEN jsonb_set(p, '{bornDay}', to_jsonb((p->>'bornDay')::int - $2::int)) ELSE p END)
            FROM jsonb_array_elements(state->'people') p))
       WHERE id = $1`,
      [villageId, years * 365],
    );
  };
  await older(one!.id, 20);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  const grid = page.getByTestId('build-grid');
  // pole jde stavět kdykoli (jen právo rozhoduje)
  const first = grid.getByRole('button', { name: 'Pole' });
  await expect(first).toBeDisabled({ timeout: 30_000 });
  await first.hover({ force: true });
  await expect(grid.getByTestId('rights-reason').first()).toHaveText(/^Rozhoduje .+\.$/);

  // Stolec u seniora v přepínači vsí a v panelu rodu.
  await page.getByTestId('village-name').click();
  const list = page.getByTestId('village-list');
  await expect(
    list.locator(`[data-village="${one!.id}"] [data-testid="senior-throne"]`),
  ).toBeVisible();
  await expect(
    list.locator(`[data-village="${two.id}"] [data-testid="player-lord-banner"]`),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // Hráčův muž zestárne – je nejstarší, takže smí v cizí vsi rodu stavět (ves vede jiný muž).
  await older(two.id, 40);
  await pollVillage(page);
  await expect(first).toBeEnabled({ timeout: 30_000 });
});

test('ves postaví ve dvorci zemskou stezku a pošle po ní výpravu k sousedovi', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'obchod');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // Dostavěná zemnice zakladatelů je dvorec vojvody (trade.md); zásoby na obchod.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  Object.assign(state, {
    storesKg: 4000,
    meatKg: 300,
    cheeseKg: 300,
    legumesKg: 300,
    woodLogs: 40,
    crafts: { charcoalKg: 400, potteryKg: 60, ironBarsKg: 20 },
  });
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  // Klik na dvorec – panel dvorce s vylepšeními vsi
  await page.keyboard.press('r');
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          spots.dwelling,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await expect(panel.getByTestId('manor-trade')).toBeDisabled();

  // Zemská stezka: růžice 8 směrů – první směr, kudy stezka vede
  await panel.getByTestId('manor-trail').click();
  const compass = page.getByTestId('trail-compass');
  await expect(compass).toBeVisible();
  const open = compass.locator('button[data-status="none"]:not([disabled])').first();
  const direction = (await open.getAttribute('data-testid'))!.replace('trail-', '');
  await open.click();
  await expect
    .poll(async () => (await villageState(s.settlementId)).trails?.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Stezka je dostavěná (jako po letech práce) – obchod se otevře
  const built = await villageState(s.settlementId);
  const trail = built.trails![0]!;
  trail.builtDay = built.lastDay;
  built.constructions = built.constructions.filter((c) => c.trail === undefined);
  for (const road of built.roads?.roads ?? []) {
    if (trail.pieces.some((p) => p.roadId === road.id)) road.grade = 'improved';
  }
  await writeVillageState(s.settlementId, built);
  await pollVillage(page);
  await expect(panel.getByTestId('manor-trade')).toBeEnabled({ timeout: 20_000 });
  await panel.getByTestId('manor-trade').click();
  await expect(page.getByTestId('trade-panel')).toBeVisible();

  // Výhodná výměna: kus nabízeného zboží za sháněné, které ves má
  const neighbour = neighbourOf(built.seed, trail.direction);
  const want = neighbour.offers[0]!;
  const pay = neighbour.demands.find(
    (g) => villageGoodStock(built, g) * sellPrice(g) >= buyPrice(want),
  )!;
  const amount = Math.ceil(buyPrice(want) / sellPrice(pay));
  await page.getByTestId(`trade-get-${want}`).locator('input').fill('1');
  await page.getByTestId(`trade-give-${pay}`).locator('input').fill(String(amount));
  await expect(page.getByTestId('trade-balance')).toHaveAttribute('data-fair', 'true');
  await page.getByTestId('trade-send').click();
  await expect
    .poll(async () => (await villageState(s.settlementId)).trade?.expeditions.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(1);
  const sent = await villageState(s.settlementId);
  expect(sent.trade!.expeditions[0]).toMatchObject({ direction, get: { [want]: 1 } });
  expect(sent.chronicle.some((e) => e.kind === 'trade-departed')).toBe(true);
});

test('lidé odejdou na novou mapu – po cestě umístí první zemnici', async ({ page }) => {
  const { email, seat: s } = await newPlayer(page, 'novamapa');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const before = await twoHouseholds(s, spots.dwelling);
  await pollVillage(page);

  // Všechna obydlí → Odejít → na východ: nová mapa vedle, lidé jsou na cestě.
  const panel = await selectAllDwellings(page);
  await panel.getByTestId('leave-village').click();
  await panel.getByTestId('leave-E').click();
  const maps = (): Promise<
    {
      id: string;
      grid_x: number | null;
      grid_y: number | null;
      landscape_seed: number;
      layer_versions: LayerVersions;
    }[]
  > =>
    query(
      `SELECT s.id, s.grid_x, s.grid_y, s.landscape_seed, s.layer_versions
         FROM settlement s JOIN "user" u ON u.id = s.owner_id
        WHERE u.email = $1 AND s.archived_at IS NULL ORDER BY s.created_at`,
      [email],
    );
  await expect.poll(async () => (await maps()).length, { timeout: 30_000 }).toBe(2);
  const [home, east] = await maps();
  // mřížka je společná všem hráčům – poloha domova závisí na pořadí hráčů, východ je o sloupec dál
  expect(home).toMatchObject({ id: s.settlementId });
  expect(home!.grid_x).not.toBeNull();
  expect(east).toMatchObject({ grid_x: home!.grid_x! + 1, grid_y: home!.grid_y });
  const [travelling] = await query<{ id: string; name: string; state: VillageState }>(
    'SELECT id, name, state FROM village WHERE settlement_id = $1',
    [east!.id],
  );
  expect(travelling!.state.journey?.direction).toBe('E');
  expect(travelling!.state.people).toHaveLength(before.people.length);
  await expect(
    page.locator('[data-testid="village-notice"][data-kind="households-left"]'),
  ).toBeVisible();

  // Odešli všichni – stará ves zůstala opuštěná na své mapě (jedna ves, jedna mapa); přepnutí na
  // ves na cestě načte novou mapu – řádek „na cestě“, stavět se zatím nedá.
  const [old] = await query<{ id: string }>('SELECT id FROM village WHERE settlement_id = $1', [
    s.settlementId,
  ]);
  await page.getByTestId('village-name').click();
  await expect(
    page.getByTestId('village-list').locator(`[data-village="${old!.id}"]`),
  ).toHaveAttribute('data-state', 'abandoned');
  await page
    .getByTestId('village-list')
    .locator(`[data-village="${travelling!.id}"] [data-testid="village-select"]`)
    .click();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('village-name')).toHaveText(travelling!.name, { timeout: 30_000 });
  await expect(page.getByTestId('journey-banner')).toHaveAttribute('data-arrived', 'false');
  await expect(page.getByTestId('build-grid').getByRole('button')).toHaveCount(0);

  // Lidé dorazili (příjezd posunutý na den odchodu) – jediná stavba je první zemnice.
  const arrived = structuredClone(travelling!.state);
  arrived.journey!.arrivalDay = arrived.journey!.departedDay;
  await query('UPDATE village SET state = $2::jsonb, version = version + 1 WHERE id = $1', [
    travelling!.id,
    JSON.stringify(arrived),
  ]);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('journey-banner')).toHaveAttribute('data-arrived', 'true');
  const grid = page.getByTestId('build-grid');
  await expect(grid.getByRole('button')).toHaveCount(1);
  const land = generateLandscapeAttempt(east!.landscape_seed, east!.layer_versions);
  const first = villageSpots(land).dwelling;
  await grid.getByRole('button', { name: 'Zemnice' }).click();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: first });
  await expect
    .poll(
      async () =>
        (
          await query<{ state: VillageState }>('SELECT state FROM village WHERE id = $1', [
            travelling!.id,
          ])
        )[0]!.state.journey,
      { timeout: 30_000 },
    )
    .toBeUndefined();
  await expect(page.getByTestId('journey-banner')).toHaveCount(0);
});

test('mladší syn po pohřbu zvolí směr – výprava vyrazí hned, mateřská ves zůstane správci', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'pohreb');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  // Stav po smrti otce přímým zápisem: vojvodou je nástupce, hráč hraje za mladšího syna Ctibora.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const father = state.people.find((p) => p.id === state.dynasty!.lordId)!;
  const mother = state.people.find((p) => p.id === father.spouseId)!;
  const home = father.dwellingId;
  const born = state.lastDay - Math.ceil(20 * 365.25);
  const heirId = state.nextId++;
  const sonId = state.nextId++;
  const base = { dwellingId: home, sex: 'male' as const, fatherId: father.id, motherId: mother.id };
  state.people = state.people.filter((p) => p.id !== father.id);
  delete mother.spouseId;
  state.people.push(
    { ...base, id: heirId, bornDay: born, line: true, mainWifeSon: true, name: 'Bořek' },
    { ...base, id: sonId, bornDay: born + 200, line: true, name: 'Ctibor' },
  );
  state.dynasty = {
    lordId: heirId,
    lords: [
      { id: father.id, name: 'Bořivoj', fromDay: state.foundedDay, toDay: state.lastDay },
      { id: heirId, name: 'Bořek', fromDay: state.lastDay },
    ],
  };
  state.storesKg = 1500;
  await writeVillageState(s.settlementId, state);
  const [mother0] = await query<{ id: string }>('SELECT id FROM village WHERE settlement_id = $1', [
    s.settlementId,
  ]);
  const pending = {
    villageId: mother0!.id,
    sonId,
    deathDay: state.lastDay,
    deadlineDay: state.lastDay + 25,
  };
  await query(
    `UPDATE house SET lord_village_id = $1, lord_person_id = $2, succession_day = $3,
            pending_departure = $4::jsonb
      WHERE ended_at IS NULL AND player_id = (SELECT id FROM "user" WHERE email = $5)`,
    [mother0!.id, sonId, state.lastDay, JSON.stringify(pending), email],
  );
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });

  const panel = page.getByTestId('player-departure');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('player-departure-days')).toHaveText(/^\d+$/);
  await panel.getByTestId('leave-E').click();

  const maps = (): Promise<{ id: string }[]> =>
    query(
      `SELECT s.id FROM settlement s JOIN "user" u ON u.id = s.owner_id
        WHERE u.email = $1 AND s.archived_at IS NULL ORDER BY s.created_at`,
      [email],
    );
  await expect.poll(async () => (await maps()).length, { timeout: 30_000 }).toBe(2);
  const [, east] = await maps();
  const [travelling] = await query<{ id: string; state: VillageState }>(
    'SELECT id, state FROM village WHERE settlement_id = $1',
    [east!.id],
  );
  expect(travelling!.state.journey).toMatchObject({ direction: 'E', lordId: sonId });
  // výprava vyrazila hned, správce na cestě vypnutý; hráčův muž přešel na novou ves
  expect(travelling!.state.steward?.on).toBe(false);
  const [house] = await query<{ lord_village_id: string; pending: unknown }>(
    `SELECT lord_village_id, pending_departure AS pending FROM house
      WHERE ended_at IS NULL AND player_id = (SELECT id FROM "user" WHERE email = $1)`,
    [email],
  );
  expect(house).toMatchObject({ lord_village_id: travelling!.id, pending: null });
  // mateřská ves dál s nástupcem Bořkem a zapnutým správcem
  const left = await villageState(s.settlementId);
  expect(left.dynasty?.lordId).toBe(heirId);
  expect(left.steward?.on).toBe(true);
  expect(left.people.some((p) => p.id === sonId)).toBe(false);
  await expect(page.getByTestId('player-departure')).toHaveCount(0);
});

/** Posune čas hráče tak, aby jeho dnešek byl `month`. `day`. příštího herního roku (accounts.md). */
async function shiftPlayerTo(email: string, month: number, day: number): Promise<number> {
  const world = {
    startMs: Date.parse('2000-01-01T00:00:00+01:00'),
    endMs: Date.parse('2200-01-01T00:00:00+01:00'),
  };
  const now = getWorldState(Date.now(), world);
  if (now.status !== 'running') throw new Error('Testovací svět neběží.');
  const today = dayIndexOf(now.date);
  const target = dayIndexOf({ year: now.date.year + 1, month, day });
  await query(
    `INSERT INTO player_time_offset (player_id, offset_days)
     SELECT id, $2 FROM "user" WHERE email = $1
     ON CONFLICT (player_id) DO UPDATE SET offset_days = $2, updated_at = now()`,
    [email, target - today],
  );
  return target;
}

test('dvorec: lov navíc – v dubnu je hájení, v létě se zítra loví', async ({ page }) => {
  const { email, seat: s } = await newPlayer(page, 'lov');
  const spots = villageSpots(s.landscape);

  // Hráčův dnešek je 10. 4. – ves se založí v době hájení
  await shiftPlayerTo(email, 4, 10);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await found(page, spots.dwelling);

  // Dvorec, vedle čtyři dospělí (rodina cvičí a loví) a zvěř ve stavu, jaký ukládá server
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const [neighbour] = freeHomes(s.landscape, spots.dwelling, [spots.dwelling], 1);
  const home = state.nextId++;
  state.dwellings.push({
    id: home,
    type: 'zemnice',
    builtDay: state.lastDay,
    condition: 1,
    position: neighbour!,
  });
  const adultBorn = state.lastDay - Math.ceil(20 * 365.25);
  for (const sex of ['male', 'male', 'female', 'female'] as const) {
    state.people.push({ id: state.nextId++, bornDay: adultBorn, dwellingId: home, sex });
  }
  state.storesKg = 4000;
  state.lord = { trains: true };
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  await page.keyboard.press('r');
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          spots.dwelling,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);

  // Duben: tlačítko je zašedlé a popisek dává důvod
  const hunt = panel.getByTestId('manor-hunt');
  await expect(hunt).toBeDisabled();
  await expect(panel.getByTestId('hunt-blocked')).toContainText('hájení');
  // smečka dvorce „psi / kolik jich dvorec chce“ (wildlife.md – Co hráč vidí)
  await expect(panel.getByTestId('manor-dogs')).toHaveText(/^\d+ \/ \d+$/);

  // Léto: čas hráče na 10. 7., stav vsi o den před ním
  const july = await shiftPlayerTo(email, 7, 10);
  const summer = await villageState(s.settlementId);
  summer.lastDay = july - 1;
  await writeVillageState(s.settlementId, summer);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('r');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          spots.dwelling,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await expect(hunt).toBeEnabled({ timeout: 20_000 });
  await hunt.click();
  await expect
    .poll(async () => (await villageState(s.settlementId)).wildlife?.hunt?.extraDay, {
      timeout: 30_000,
    })
    .toBe(july + 1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
  // druhý lov hned po něm tlačítko nepustí
  await expect(hunt).toBeDisabled({ timeout: 20_000 });
  expect(dateOfDayIndex(july).month).toBe(7);

  // Zítra: čas hráče o dva dny dál – ves se dopočítá a lov proběhl
  await shiftPlayerTo(email, 7, 12);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => (await villageState(s.settlementId)).wildlife?.hunt?.year.days ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
});

test('divoká zvěř ve scéně: modely se načtou a klik na zvíře otevře panel druhu', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { seat: s } = await newPlayer(page, 'divoka');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  // ves dostane zvěř při načtení (převod stavu) – scéna ji vykreslí po dalším dotazu
  await expect
    .poll(async () => (await villageState(s.settlementId)).wildlife !== undefined)
    .toBe(true);
  // zvěř chodí jen kolem postavené vsi – obydlí hotové (jako ho uloží server)
  await writeVillageState(
    s.settlementId,
    withBuiltFirstDwelling(await villageState(s.settlementId)),
  );
  // modely testy jinak přerušují (beforeEach) – modely zvěře pustit, ostatní dál ne
  await page.unroute('**/models/**');
  await page.route('**/models/**', (route) =>
    route.request().url().includes('/models/fauna/wild-') ? route.continue() : route.abort(),
  );
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await pollVillage(page);
  // zvěř se naplánuje hned, modely se načtou až se zvěří v záběru – kamera k první skupině
  // (bývá u lesa mimo výchozí záběr) – jelení nebo prasata, vzácní (vlci, medvěd) nemusí být vidět
  await expect
    .poll(() => page.evaluate(() => window.__bohemiaE2E?.wildAnimals?.().groups.length ?? 0), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const groups = window.__bohemiaE2E!.wildAnimals!().groups;
    const first = groups.find((g) => g.species === 'deer' || g.species === 'boar') ?? groups[0]!;
    window.__bohemiaE2E!.moveCameraTo!(first.x, first.z);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          // meshe : všechny připravené : kusy vidět
          const wild = window.__bohemiaE2E!.wildAnimals!();
          const ready = wild.meshes.every((m) => m.ready);
          return `${wild.meshes.length}:${ready}:${wild.animals.length}`;
        }),
      { timeout: 60_000 },
    )
    .toMatch(/^[1-9]\d*:true:[1-9]/);
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        // zvíře chodí – poloha těsně před kliknutím
        const point = await page.evaluate(() => {
          const hooks = window.__bohemiaE2E!;
          for (const a of hooks.wildAnimals!().animals) {
            const p = hooks.projectToScreen!(a.x, a.z);
            if (p && p.x > 20 && p.y > 20 && p.x < innerWidth - 20 && p.y < innerHeight - 160) {
              return p;
            }
          }
          return null;
        });
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y - 6);
        await page.mouse.click(point.x, point.y - 6);
        return panel.getAttribute('data-kind');
      },
      { timeout: 30_000 },
    )
    .toBe('wildlife');
  await expect(panel.getByTestId('wildlife-level')).toBeVisible();
  expect(errors).toEqual([]);
});

test('díl pole ukáže škodu zvěře letos', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'zver');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  await page.keyboard.press('c');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);

  // Ves se zvěří (převod při načtení) a škoda letos na všech dílech pole
  const withParts = withBuiltFirstDwelling(await villageState(s.settlementId));
  await expect
    .poll(async () => (await villageState(s.settlementId)).wildlife !== undefined)
    .toBe(true);
  const state = withParts;
  state.wildlife = (await villageState(s.settlementId)).wildlife!;
  const ids = state.parts.map((p) => p.id);
  state.wildlife.damage = {
    fromDay: state.lastDay - 20,
    risk: ids.map((partId) => ({ partId, weightHa: 0.01, edgeM: 80 })),
    parts: Object.fromEntries(ids.map((id) => [String(id), { share: 0.12, kg: 30 }])),
    topPartId: ids[0] ?? null,
    totalKg: 30 * ids.length,
  };
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  await page.mouse.move(640, 360);
  await page.keyboard.press('r');
  const fieldCenter = tileCenterWorld(s.landscape, spots.cells[0]!.x, spots.cells[0]!.y);
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          fieldCenter,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getAttribute('data-kind');
      },
      { timeout: 30_000 },
    )
    .toBe('field-part');
  await expect(panel.getByTestId('selection-damage')).toHaveText('12 %');
  await expect(panel.getByTestId('selection-damage')).toHaveAttribute('data-alert', 'true');
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
});

test('vývojový režim: vynucené sucho – ikona na liště, upozornění a ochrana dílu', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'pohromy');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  await page.keyboard.press('c');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);
  // bez vývojového režimu tlačítka pohrom nejsou a průběh přeskoku se nedá číst
  await expect(page.getByTestId('dev-disasters')).toHaveCount(0);
  expect((await page.request.get('/api/dev/skip-progress')).status()).toBe(403);
  await query('UPDATE "user" SET dev_mode = true WHERE email = $1', [email]);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  // s ním ano – žádný přeskok neběží (Route Handler, ne server action – nečeká za přeskokem)
  const idle = await page.request.get('/api/dev/skip-progress');
  expect(idle.status()).toBe(200);
  expect(await idle.json()).toEqual({ progress: null });

  // Kruté sucho letos – vidět je až od 1. 5., proto se v e2e světě skáče po měsících; vynutí se
  // znovu po každém skoku (skok přes Nový rok by ho jinak nechal v loňsku).
  const summer = page.getByTestId('village-weather-summer');
  const notice = page.locator('[data-testid="village-notice"][data-kind="drought"]');
  const skip = page.getByTestId('dev-skip-month');
  for (let i = 0; i < 14; i++) {
    await page.getByTestId('dev-bad-year').click();
    await page.getByTestId('dev-force-drought').click();
    await expect(page.getByTestId('dev-bad-year')).toBeEnabled({ timeout: 60_000 });
    if ((await summer.count()) > 0) break;
    await skip.click();
    await expect(skip).toBeEnabled({ timeout: 60_000 });
    if ((await summer.count()) > 0) break;
  }
  await expect(summer).toHaveAttribute('data-weather', 'drought');
  await expect(notice).toHaveText('Sucho – nejvíc trpí pole bez stromů');
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
  const state = await villageState(s.settlementId);
  expect(Object.values(state.disasters?.override?.weather ?? {})).toContainEqual({
    summer: 'drought',
  });

  // Panel dílu ukáže ochranu dílu (lístky 0–4).
  await page.mouse.move(640, 360);
  await page.keyboard.press('r');
  const fieldCenter = tileCenterWorld(s.landscape, spots.cells[0]!.x, spots.cells[0]!.y);
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          fieldCenter,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getAttribute('data-kind');
      },
      { timeout: 30_000 },
    )
    .toBe('field-part');
  await expect(panel.getByTestId('selection-protection')).toHaveText(/^[0-4]$/);
});

test('správce vsi – zapnutí a vypnutí přepínačem v seznamu vsí, ikona u jména', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'spravce');
  await found(page, villageSpots(s.landscape).dwelling);
  const badge = page.getByTestId('steward-badge');
  // správce je ve vsi založené hráčem vypnutý – u jména ikona není
  await expect(badge).toHaveCount(0);

  await page.getByTestId('village-name').click();
  const toggle = page.getByTestId('village-steward-toggle').first();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(badge).toBeVisible();
  expect((await villageState(s.settlementId)).steward?.on).toBe(true);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(badge).toHaveCount(0);
  expect((await villageState(s.settlementId)).steward?.on).toBe(false);
});

test('správce jiné vsi ze seznamu – pohled zůstane na zobrazené vsi', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'spravce2');
  await found(page, villageSpots(s.landscape).dwelling);
  const two = await villageOnNextMap(s.settlementId, 'Budeč', { own: true });
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  const name = page.getByTestId('village-name');
  const first = suggestVillageName(s.seed);
  await expect(name).toHaveText(first, { timeout: 30_000 });

  // zapnutí správce u druhé vsi (zobrazená je první) nepřepne pohled
  await name.click();
  const toggle = page
    .getByTestId('village-list')
    .locator(`[data-village="${two.id}"]`)
    .getByTestId('village-steward-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(name).toHaveText(first);
  await expect(page.getByTestId('steward-badge')).toHaveCount(0);
});
