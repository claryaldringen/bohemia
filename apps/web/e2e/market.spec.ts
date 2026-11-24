import { test, expect } from '@playwright/test';
import { useUniqueClientIp } from './helpers';
import {
  changeVillageState,
  found,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  twoHouseholds,
  villageOnNextMap,
  villageSpots,
  villageState,
} from './village-helpers';

// Panel Trh ve dvorci (markets.md – Pravidla 9): hráč otevře Obchod, vybere vlastní ves na
// sousední mapě, zadá, co dá a co chce, a vyšle výpravu. Výprava je ve stavu domovské vsi a příjezd
// čeká ve schránce hostitele.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 180_000 });

test('trh – výprava z dvorce do vlastní vsi na sousední mapě', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'trh');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // dvě domácnosti (dost dospělých) a obilí; ves na mapě vedle přebírá kopii stavu. Bez `own` zůstává
  // hráčovým mužem vojvoda domovské vsi (jen v ní hráč smí obchodovat), Lhota je ves jeho rodu.
  await twoHouseholds(s, spots.dwelling);
  // nástroje ve vybavení nad potřebou a volný muž na prodej (plán 3 – nová nabídka trhu)
  await changeVillageState(s.settlementId, (st) => ({
    ...st,
    storesKg: 3000,
    toolEquipmentKg: 150,
  }));
  const lhota = await villageOnNextMap(s.settlementId, 'Lhota');
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 90_000 });
  await pollVillage(page);

  // klik na dvorec – panel dvorce
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
      { timeout: 60_000 },
    )
    .toBe(1);

  await panel.getByTestId('manor-market').click();
  const market = page.getByTestId('market-panel');
  await expect(market).toBeVisible();
  const row = market.getByTestId('market-village').filter({ hasText: 'Lhota' });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText('Ráno tam, večer zpět');

  // Dáš obilí 100, Dostaneš klády 1, pobyt 1 den
  await row.getByRole('button', { name: 'Lhota' }).click();
  await expect(market.getByTestId('market-report')).toBeVisible();
  // nové zboží v „Dáš“: nástroje po celých kg a muž s ikonou
  await expect(market.getByTestId('market-give-tools')).toBeVisible();
  await expect(market.getByTestId('market-give-men')).toBeVisible();
  await expect(market.getByTestId('market-give-men').locator('img')).toHaveAttribute(
    'src',
    '/icons/resources/man.png',
  );
  await market.getByTestId('market-give-men-plus').click();
  await expect(market.getByTestId('market-give-men')).toContainText('1');
  await market.getByTestId('market-give-grain-plus').click();
  await market.getByTestId('market-want-logs-plus').click();
  await expect(market.getByTestId('market-preview')).toBeVisible();
  await expect(market.getByTestId('market-send')).toBeEnabled();
  await market.getByTestId('market-send').click();

  await expect(market.getByTestId('market-trip')).toHaveCount(1, { timeout: 60_000 });
  await expect(market.getByTestId('market-error')).toHaveCount(0);

  // domovská ves má výpravu na trh, ves Lhota příjezd ve schránce
  const home = await villageState(s.settlementId);
  const trip = home.trade?.expeditions.find((e) => e.kind === 'market');
  expect(trip?.market?.stayDays).toBe(1);
  // kronika: výprava hráče s muži na prodej, text beze změny („Výprava vyrazila na trh do vsi …“)
  const departed = home.chronicle.find((e) => e.kind === 'market-departed');
  expect(departed).toMatchObject({ villageName: 'Lhota', give: { men: 1, grain: 100 } });
  const mail = await query<{ ref: string }>(
    `SELECT ref FROM village_inbox
      WHERE village_id = $1 AND body->>'kind' = 'market-arrive' AND ref LIKE 'market:%:in'`,
    [lhota.id],
  );
  expect(mail).toHaveLength(1);
});
