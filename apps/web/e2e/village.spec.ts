import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  checkDwellingPlacement,
  fieldPartsFromOutline,
  generateLandscapeAttempt,
  tileCenterWorld,
  type Landscape,
  type LayerVersions,
  type Position,
} from '@bohemia/game';
import type { PlacementResult } from '../lib/scene/village-types';
import { TEST_DATABASE_URL } from '../playwright.config';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';

// Založení vsi projde celou cestou hráče (dialog, server action, panel, scéna) – jen kliknutí
// do 3D scény nahrazuje testovací háček `window.__bohemiaE2E.confirmPlacement` (lib/e2e-hooks.ts,
// jen v buildu s NEXT_PUBLIC_E2E_HOOKS=1). Krajina nového hráče je náhodná a bezhlavý prohlížeč
// kreslí softwarově – volné místo pro zemnici a pole proto test spočítá předem ze seedu krajiny
// v databázi stejnými pravidly, jaká používá hra.

test.beforeEach(async ({ context }) => {
  await useUniqueClientIp(context);
});

test.describe.configure({ timeout: 120_000 });

/** Krajina sídla hráče – stejně jako ji generuje server (seed a verze vrstev z databáze). */
async function seatLandscape(email: string): Promise<Landscape> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ landscape_seed: number; layer_versions: LayerVersions }>(
      `SELECT s.landscape_seed, s.layer_versions
         FROM settlement s JOIN "user" u ON u.id = s.owner_id
        WHERE u.email = $1`,
      [email],
    );
    const seat = rows[0];
    if (!seat) throw new Error(`Hráč ${email} nemá sídlo.`);
    return generateLandscapeAttempt(seat.landscape_seed, seat.layer_versions);
  } finally {
    await client.end();
  }
}

/** Místo pro první zemnici u místa vsi a čtverec pole (36 × 36 m ≈ 0,13 ha) vedle ní. */
function foundingSpot(l: Landscape): { dwelling: Position; outline: [number, number][] } {
  const site = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const half = 18;
  for (let r = 0; r <= 240; r += 6) {
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * 2 * Math.PI;
      const dwelling = {
        x: site.x + r * Math.cos(angle),
        z: site.z + r * Math.sin(angle),
        rotation: 0,
      };
      if (!checkDwellingPlacement(l, null, 'zemnice', dwelling).ok) continue;
      for (const [dx, dz] of [
        [26, 0],
        [-26, 0],
        [0, 26],
        [0, -26],
      ] as const) {
        const cx = dwelling.x + dx;
        const cz = dwelling.z + dz;
        const outline: [number, number][] = [
          [cx - half, cz - half],
          [cx + half, cz - half],
          [cx + half, cz + half],
          [cx - half, cz + half],
        ];
        if (fieldPartsFromOutline(l, null, outline, [dwelling]).check.ok) {
          return { dwelling, outline };
        }
      }
    }
  }
  throw new Error('V krajině není volné místo pro ves.');
}

/** Potvrdí běžící umisťování háčkem – naběhne, až je scéna připravená. */
async function confirmPlacement(page: Page, result: PlacementResult): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__bohemiaE2E?.confirmPlacement === 'function',
    null,
    {
      timeout: 60_000,
    },
  );
  await page.evaluate((r) => window.__bohemiaE2E!.confirmPlacement!(r), result);
}

test('nový hráč založí ves – jméno, zemnice, první pole – a vidí panel vsi', async ({ page }) => {
  // Bez modelů stromů naběhne softwarově kreslená scéna rychleji (viz landscape.spec.ts).
  await page.route('**/models/**', (route) => route.abort());
  const email = await registerAndEnterGame(page, 'ves');
  const founding = page.getByTestId('founding-panel');
  await expect(founding.getByRole('heading', { name: 'Založ ves' })).toBeVisible();
  const spot = foundingSpot(await seatLandscape(email));

  await page.getByLabel('Jméno vsi').fill('Testovice');
  await page.getByRole('button', { name: 'Dál – umístit zemnici' }).click();
  await expect(founding.getByRole('heading', { name: 'Umísti zemnici' })).toBeVisible();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: spot.dwelling });

  await expect(founding.getByRole('heading', { name: 'Vyznač první pole' })).toBeVisible();
  await confirmPlacement(page, { kind: 'field', outline: spot.outline });
  await expect(founding.getByText(/^0,1\d ha · úrodnost \d+ · \d+ člověkod/)).toBeVisible();
  await page.getByRole('button', { name: 'Založit ves' }).click();

  const panel = page.getByTestId('village-panel');
  await expect(panel.getByRole('heading', { name: 'Testovice' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('village-people')).toHaveText('4');
  await expect(panel.getByText(/^Pole 0,1\d ha$/)).toBeVisible();
  await expect(panel.getByText('Osadníci založili ves Testovice.')).toBeVisible();
  await expect(
    page.getByTestId('build-menu').getByRole('button', { name: /^Zemnice/ }),
  ).toBeDisabled();

  // Ves je uložená na serveru – po novém načtení stránky je tu dál, bez dialogu založení.
  await page.reload();
  await expect(
    page.getByTestId('village-panel').getByRole('heading', { name: 'Testovice' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('founding-panel')).toHaveCount(0);
});
