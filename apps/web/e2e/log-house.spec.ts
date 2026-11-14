import { test, expect } from '@playwright/test';
import {
  checkPlotPlacement,
  dayIndexOf,
  placementVillageOf,
  tileOfWorldPoint,
  type DwellingPlot,
  type Position,
} from '@bohemia/game';
import {
  changeVillageState,
  confirmPlacement,
  found,
  newPlayer,
  query,
  readyScene,
  dwellingVariant,
  villageSpots,
  villageState,
} from './village-helpers';

// Nadzemní dům (log-house.md – Dům; plán 2026-11-12-log-house – Úloha 5): do roku 800 je tlačítko
// zašedlé s důvodem „Od roku 800“, po posunu času hráče do roku 800 jde umístit klávesou 1.
test('nadzemní dům – do roku 800 zašedlý, pak klávesa 1 a umístění na pozemku', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const { email, seat: s } = await newPlayer(page, 'srub');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  const grid = page.getByTestId('build-grid');
  const srub = await dwellingVariant(page, 'Nadzemní dům');
  await expect(srub).toBeDisabled();
  await srub.hover({ force: true });
  // popisek u kurzoru (Tooltip mimo mřížku) – důvod zašednutí
  await expect(
    page.getByTestId('build-blocked').filter({ hasText: /^Od roku 800$/ }),
  ).toBeVisible();
  await page.mouse.move(640, 360);

  // posun času hráče do jara roku 800 (player_time_offset jako šipky vývojového režimu); ves se
  // posune s ním – lidé o stejný kus později narození, ať 300 let nedopočítává
  const before = await villageState(s.settlementId);
  const target = dayIndexOf({ year: 800, month: 4, day: 15 });
  const shift = target - before.lastDay;
  await query(
    `INSERT INTO player_time_offset (player_id, offset_days)
       SELECT id, $2 FROM "user" WHERE email = $1
     ON CONFLICT (player_id) DO UPDATE SET offset_days = $2, updated_at = now()`,
    [email, shift],
  );
  await changeVillageState(s.settlementId, (state) => ({
    ...state,
    lastDay: state.lastDay + shift,
    people: state.people.map((p) => ({ ...p, bornDay: p.bornDay + shift })),
  }));
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 120_000 });
  await expect(await dwellingVariant(page, 'Nadzemní dům')).toBeEnabled({ timeout: 60_000 });

  // pozemek pro srub u první zemnice (stejná kontrola jako server)
  const state = await villageState(s.settlementId);
  const village = placementVillageOf(state, state.lastDay);
  const spot = srubPlot(s.landscape, village, spots.dwelling);
  await page.keyboard.press('Digit1');
  await expect(grid.getByRole('button', { name: 'Obydlí', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await confirmPlacement(page, {
    kind: 'dwelling',
    type: 'srub',
    position: spot.position,
    plot: spot.plot,
  });
  await expect
    .poll(
      async () =>
        (await villageState(s.settlementId)).constructions.some(
          (c) => c.kind === 'dwelling' && c.dwellingType === 'srub',
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
});

/** Nejbližší pozemek kolem zemnice, kam projde nadzemní dům (bez zabrání pole). */
function srubPlot(
  landscape: Parameters<typeof checkPlotPlacement>[0],
  village: Parameters<typeof checkPlotPlacement>[1],
  near: Position,
): { position: Position; plot: DwellingPlot } {
  const tile = tileOfWorldPoint(landscape, near.x, near.z);
  if (!tile) throw new Error('Zemnice je mimo krajinu.');
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const plot: DwellingPlot = { cell: { x: tile.x + dx, y: tile.y + dy }, variant: 'center' };
        const check = checkPlotPlacement(landscape, village, 'srub', plot);
        if (check.ok && check.position && check.takenLand.length === 0) {
          return { position: check.position, plot };
        }
      }
    }
  }
  throw new Error('U zemnice není volný pozemek pro nadzemní dům.');
}
