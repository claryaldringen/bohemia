import { test, expect, type Locator, type Page } from '@playwright/test';
import { nextMerchantVisit, type MerchantStop, type Position } from '@bohemia/game';
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
// sousední mapě, zadá, co dá (i mince) a co chce, a vyšle výpravu. Výprava je ve stavu domovské vsi
// a příjezd čeká ve schránce hostitele. Cizí kupci (Rozhodnutí plánu 4, body 12 a 15): upozornění na
// příjezd, počet dní do příštího a objednávka zbroje ve vlastní vsi u stezky.

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

/** Zastávka stezky, na kterou kupci ode dne `today` nejdřív dojedou právě v den `day`. */
function stopWithVisit(today: number, day: number): MerchantStop {
  for (let seed = 1; seed <= 5000; seed++) {
    // index 40: den příjezdu padne i do té části čtvrtletí, kdy průjezdy nevyjíždějí
    for (const index of [0, 40]) {
      const stop: MerchantStop = { key: '0,0,E', seed, index, length: 2 * index + 1 };
      if (nextMerchantVisit([stop], today)?.day === day) return stop;
    }
  }
  throw new Error(`Zastávka s příjezdem kupců v den ${day} se nenašla.`);
}

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
    coins: 50,
    // mapa bez stezky (sídlo testu může mít prémiovou krajinu se stezkou)
    merchantStops: [],
  }));
  const lhota = await villageOnNextMap(s.settlementId, 'Lhota');
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 90_000 });
  await pollVillage(page);

  const panel = await openManor(page, spots.dwelling);
  // mince mezi zásobami dvorce; ves bez stezky kupce nemá
  await expect(panel.getByTestId('wares-coins')).toHaveText('50');
  await expect(panel.getByTestId('manor-merchants')).toHaveCount(0);
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
  // mince jsou v „Dáš“ s počtem, v „Dostaneš“ ne; bez stezky ani sekce zbroje
  // mince po deseti
  await market.getByTestId('market-give-coins-plus').click();
  await expect(market.getByTestId('market-give-coins-count')).toHaveText('10');
  await expect(market.getByTestId('market-want-coins')).toHaveCount(0);
  await expect(market.getByTestId('market-arms')).toHaveCount(0);
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
  expect(departed).toMatchObject({ villageName: 'Lhota', give: { men: 1, grain: 100, coins: 10 } });
  // mince ubyly vsi při odjezdu a jedou s výpravou
  expect(home.coins).toBe(40);
  const mail = await query<{ ref: string }>(
    `SELECT ref FROM village_inbox
      WHERE village_id = $1 AND body->>'kind' = 'market-arrive' AND ref LIKE 'market:%:in'`,
    [lhota.id],
  );
  expect(mail).toHaveLength(1);

  // kronika výpravu s mincemi ukáže
  await page.keyboard.press('Escape');
  await expect(market).toHaveCount(0);
  await page.getByTestId('chronicle-toggle').click();
  const entry = page
    .getByTestId('chronicle-panel')
    .locator('[data-testid="chronicle-entry"][data-kind="market-departed"]');
  await expect(entry).toContainText('Výprava vyrazila na trh do vsi Lhota', { timeout: 30_000 });
  await expect(entry).toContainText('10 mincí');
});

test('kupci u stezky – den příjezdu, upozornění a objednávka zbroje', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'kupci');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  await twoHouseholds(s, spots.dwelling);
  // ves u stezky, kam kupci přijedou za 12 dní, s mincemi a zbrojí
  await changeVillageState(s.settlementId, (st) => ({
    ...st,
    coins: 50,
    arms: { swords: 2, helmets: 1 },
    merchantStops: [stopWithVisit(st.lastDay, st.lastDay + 12)],
  }));
  await pollVillage(page);

  const panel = await openManor(page, spots.dwelling);
  const merchants = panel.getByTestId('manor-merchants');
  // den příjezdu je pevný, počet dní do něj se s hranicí herního dne (≈ 86 s) o jedničku zkrátí –
  // dny čteme z pohledu (po načtení), ne z pevného čísla
  await expect(merchants).toHaveText(/^1[12]$/, { timeout: 30_000 });
  const inDays = Number((await merchants.textContent()) ?? '');
  // popisek je skrytý, dokud na ikonu hráč nenajede (`getByRole` by ho nenašel)
  const trade = 'kupují med, vosk, kožešiny a otroky, prodávají meče, kroužkové košile a helmy';
  const tooltip = panel.locator('[role="tooltip"]');
  await expect(tooltip.filter({ hasText: 'Kupci' })).toHaveText(
    new RegExp(`^Kupci přijedou za (${inDays}|${inDays - 1}) (dní|den) – ${trade}$`),
  );
  await expect(panel.getByTestId('wares-coins')).toHaveText('50');
  await expect(panel.getByTestId('wares-swords')).toHaveText('2');
  await expect(panel.getByTestId('wares-helmets')).toHaveText('1');
  await expect(panel.getByTestId('wares-mailShirts')).toHaveCount(0);

  // kupci přijedou dnes: dnešek se dopočítá s příjezdem (ves je o den zpátky)
  await changeVillageState(s.settlementId, (st) => ({
    ...st,
    lastDay: st.lastDay - 1,
    merchantStops: [stopWithVisit(st.lastDay, st.lastDay)],
  }));
  await pollVillage(page);
  const notice = page.getByTestId('village-notice').filter({ hasText: 'Kupci přijeli' });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice.getByTestId('village-notice-icon')).toHaveAttribute(
    'src',
    '/icons/resources/merchants.png',
  );
  await expect(merchants).toHaveText('0');
  await expect(tooltip.filter({ hasText: 'Kupci' })).toHaveText(
    `Kupci jsou dnes ve vsi – ${trade}`,
  );

  // objednávka meče v panelu Trh – uloží ji server
  await panel.getByTestId('manor-market').click();
  const market = page.getByTestId('market-panel');
  await expect(market.getByTestId('market-arms')).toBeVisible();
  await expect(market.getByTestId('market-arms-swords')).toContainText('120');
  await market.getByTestId('market-arms-swords-plus').click();
  await expect(market.getByTestId('market-arms-swords-count')).toHaveText('1');
  await expect
    .poll(async () => (await villageState(s.settlementId)).armsOrder, { timeout: 30_000 })
    .toEqual({ swords: 1 });
  await expect(market.getByTestId('market-arms-error')).toHaveCount(0);

  // po obnovení stránky je tam pořád, nula ji zruší
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 90_000 });
  await (await openManor(page, spots.dwelling)).getByTestId('manor-market').click();
  await expect(market.getByTestId('market-arms-swords-count')).toHaveText('1', {
    timeout: 30_000,
  });
  await market.getByTestId('market-arms-swords-minus').click();
  await expect(market.getByTestId('market-arms-swords-count')).toHaveText('0');
  await expect
    .poll(async () => (await villageState(s.settlementId)).armsOrder ?? null, { timeout: 30_000 })
    .toBeNull();
});
