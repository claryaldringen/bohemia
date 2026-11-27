import { test, expect, type Locator, type Page } from '@playwright/test';
import { type Position } from '@bohemia/game';
import { useUniqueClientIp } from './helpers';
import {
  changeVillageState,
  found,
  newPlayer,
  pollVillage,
  readyScene,
  twoHouseholds,
  villageOnNextMap,
  villageSpots,
} from './village-helpers';

// Zlato a klenoty (gold.md – plán 6): zámky dílen v nabídce staveb (rýžovník bez náplavu, mincovna
// do roku 950), zlato a šperky v zásobách dvorce a zlato v panelu Trh (krok po deseti gramech).

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 180_000 });

/** Klik na dvorec ve scéně – panel dvorce s vylepšeními vsi. */
async function openManor(page: Page, manor: Position): Promise<Locator> {
  await page.keyboard.press('r');
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          manor,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  return panel;
}

test('dílny zlata – zámky rýžovníka a mincovny, šperkař dostupný', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'zlato-dilny');
  await found(page, villageSpots(s.landscape).dwelling);

  const grid = page.getByTestId('build-grid');
  const panner = grid.getByRole('button', { name: 'Rýžovník', exact: true });
  const jeweller = grid.getByRole('button', { name: 'Šperkař', exact: true });
  const minter = grid.getByRole('button', { name: 'Mincovna', exact: true });

  // rýžovník: krajina bez zlatonosného potoka nemá náplav (sídlo testu může mít prémiovou krajinu)
  if (s.landscape.premium !== 'gold-stream') {
    await expect(panner).toBeDisabled();
    await panner.hover({ force: true });
    await expect(
      page.getByTestId('build-blocked').filter({ hasText: /^Bez zlatonosného náplavu$/ }),
    ).toBeVisible();
    await page.mouse.move(640, 360);
  }

  // mincovna: svět e2e začíná v roce 500, do roku 950 je zašedlá
  await expect(minter).toBeDisabled();
  await minter.hover({ force: true });
  await expect(
    page.getByTestId('build-blocked').filter({ hasText: /^Od roku 950$/ }),
  ).toBeVisible();
  await page.mouse.move(640, 360);

  // šperkař žádný zámek nemá
  await expect(jeweller).toBeEnabled();
});

test('zlato ve dvorci a v panelu Trh – zásoby, krok po deseti gramech a 2,4 g za minci', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'zlato-trh');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  await twoHouseholds(s, spots.dwelling);
  await changeVillageState(s.settlementId, (st) => ({
    ...st,
    storesKg: 3000,
    coins: 50,
    gold: 84.5,
    jewelleryG: 30,
    // mapa bez stezky (sídlo testu může mít prémiovou krajinu se stezkou)
    merchantStops: [],
  }));
  await villageOnNextMap(s.settlementId, 'Lhota');
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 90_000 });
  await pollVillage(page);

  const panel = await openManor(page, spots.dwelling);
  await expect(panel.getByTestId('wares-gold')).toHaveText('84,5');
  await expect(panel.getByTestId('wares-jewellery')).toHaveText('30');

  await panel.getByTestId('manor-market').click();
  const market = page.getByTestId('market-panel');
  await expect(market).toBeVisible();
  const row = market.getByTestId('market-village').filter({ hasText: 'Lhota' });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole('button', { name: 'Lhota' }).click();
  await expect(market.getByTestId('market-report')).toBeVisible();

  // zlato je v „Dáš“ s krokem 10 g; váha zlata za minci je u řádku
  await expect(market.getByTestId('market-give-gold')).toBeVisible();
  await market.getByTestId('market-give-gold-plus').click();
  await expect(market.getByTestId('market-give-gold-count')).toHaveText('10');
  await market.getByTestId('market-give-gold-plus').click();
  await expect(market.getByTestId('market-give-gold-count')).toHaveText('20');
  await expect(
    market.getByTestId('market-give-gold').getByTestId('market-gold-price'),
  ).toContainText('2,4 g');
  // zlomek gramu (84,5) se nenabízí – nahoře celých 84 g
  for (let i = 0; i < 7; i++) await market.getByTestId('market-give-gold-plus').click();
  await expect(market.getByTestId('market-give-gold-count')).toHaveText('84');
  // zlato jde i koupit
  await expect(market.getByTestId('market-want-gold')).toBeVisible();
});
