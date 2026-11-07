import { test, expect, type Page } from '@playwright/test';
import { register, uniqueEmail, useUniqueClientIp } from './helpers';
import { linkFromLastMail } from './mail';
import { found, newPlayer, query, readyScene, seat, villageSpots } from './village-helpers';

// Vstup nováčka (newcomers.md – Rozhraní): nováček bez pozvánky volí „Vybrat pána“ (nabídka rodů
// s aspoň 2 vsemi, žádost, čekání v odříznuté krajině; pán jen přijme / odmítne), nebo
// „Svobodný“ – pak je hned na mapě světa.

async function openHousePanel(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const panel = page.getByRole('dialog', { name: 'Rod a vazalové' });
  if (await panel.isVisible()) await page.getByRole('button', { name: 'Rod a vazalové' }).click();
  await page.getByRole('button', { name: 'Rod a vazalové' }).click();
  await expect(panel).toBeVisible();
  return panel;
}

async function enterAsNewcomer(page: Page, prefix: string, language?: string): Promise<string> {
  const email = uniqueEmail(prefix);
  await register(page, email, 'novacek-heslo-1', language);
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await expect(page).toHaveURL(/\/game$/);
  return email;
}

interface HouseRow {
  id: string;
  placed: boolean;
  language: string;
}

async function houseOf(email: string): Promise<HouseRow> {
  const [row] = await query<HouseRow>(
    `SELECT h.id, h.placed_at IS NOT NULL AS placed, h.language FROM house h
       JOIN "user" u ON u.id = h.player_id
      WHERE u.email = $1 AND h.ended_at IS NULL`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá rod.`);
  return row;
}

/** Poloha sídelního sídla na mapě světa; null – sídlo je jen v odříznuté krajině. */
async function worldCellOf(email: string): Promise<{ x: number; y: number } | null> {
  const [row] = await query<{ grid_x: number | null; grid_y: number | null }>(
    `SELECT s.grid_x, s.grid_y FROM settlement s JOIN "user" u ON u.id = s.owner_id
      WHERE u.email = $1 AND s.is_seat AND s.archived_at IS NULL`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá sídlo.`);
  return row.grid_x === null || row.grid_y === null ? null : { x: row.grid_x, y: row.grid_y };
}

test('nováček vybere pána, staví v odříznuté krajině, pán přijme; svobodný je hned na mapě', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // nabídka pánů bere rody s nejmenším počtem vsí ≥ 2 – rody z dřívějších testů sdílené databáze
  // by do ní mohly přibýt, proto je tu ukončíme (zápisem konce rodu, data zůstanou)
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page, Page];
  for (const page of [a, b, c]) await page.setViewportSize({ width: 1280, height: 720 });

  // A: rod na mapě světa se 2 vsemi – druhá ves na sousední mapě zápisem do testovací DB
  // (kopie stavu i souhrnu, aby se počítala mezi živé vsi nabídky)
  const { email: emailA, seat: seatA } = await newPlayer(a, 'nc-pan');
  await found(a, villageSpots(seatA.landscape).dwelling);
  const [map] = await query<{ id: string }>(
    `INSERT INTO settlement (owner_id, landscape_seed, layer_versions, grid_x, grid_y)
       SELECT owner_id, landscape_seed, layer_versions, grid_x + 1, grid_y FROM settlement
        WHERE id = $1
     RETURNING id`,
    [seatA.settlementId],
  );
  await query(
    `INSERT INTO village (settlement_id, name, state, version, digest, digest_version)
       SELECT $2, 'Druhá', state, version, digest, digest_version FROM village
        WHERE settlement_id = $1`,
    [seatA.settlementId, map!.id],
  );
  const houseA = await houseOf(emailA);
  const cellA = await worldCellOf(emailA);
  expect(cellA).not.toBeNull();

  // B (němčina): volba cesty před jménem vojvody – Vybrat pána → A (ikona jazyka) → žádost
  const emailB = await enterAsNewcomer(b, 'nc-vazal', 'de');
  expect((await houseOf(emailB)).language).toBe('de');
  const choice = b.getByTestId('newcomer-choice');
  await expect(choice).toBeVisible({ timeout: 60_000 });
  await expect(b.getByTestId('line-name-panel')).toHaveCount(0);
  await choice.getByTestId('newcomer-choose-lord').click();
  const offer = b.getByTestId('newcomer-offer');
  const rowA = offer.getByTestId(`newcomer-offer-${houseA.id}`);
  await expect(rowA).toBeVisible();
  await expect(rowA.getByTestId('language-icon-cs')).toBeVisible();
  await rowA.click();
  await offer.getByTestId('newcomer-send').click();
  await expect(b.getByTestId('newcomer-error')).toHaveCount(0);
  await expect(offer).toHaveCount(0, { timeout: 30_000 });

  // B čeká v odříznuté krajině: staví ves, na mapě světa není, pozvánku nevydá
  await expect(readyScene(b)).toBeVisible({ timeout: 60_000 });
  const seatB = await seat(emailB);
  await found(b, villageSpots(seatB.landscape).dwelling, 'Ulrich');
  expect(await worldCellOf(emailB)).toBeNull();
  await expect(b.getByTestId('minimap-panel')).toHaveAttribute('data-isolated', 'true');
  const panelB = await openHousePanel(b);
  await expect(panelB.getByTestId('house-newcomer')).toBeVisible();
  await expect(panelB.getByTestId(`newcomer-request-${houseA.id}`)).toHaveAttribute(
    'data-state',
    'pending',
  );
  await expect(panelB.getByTestId('newcomer-countdown')).toHaveText(/^6 d /);
  await expect(panelB.getByTestId('house-invite-issue')).toBeDisabled();
  await expect(panelB.getByTestId('house-invite-issue')).toHaveAttribute(
    'data-reason',
    'Nejdřív musíš být na mapě světa.',
  );
  await expect(panelB.getByTestId('house-own-man')).not.toHaveCount(0);

  // A: žádost nováčka jen Přijmout / Odmítnout, bez protinávrhu
  const panelA = await openHousePanel(a);
  const request = panelA.getByTestId('house-negotiation');
  await expect(request.getByTestId('newcomer-accept')).toBeVisible({ timeout: 30_000 });
  await expect(request.getByTestId('newcomer-reject')).toBeVisible();
  await expect(request.getByTestId('negotiation-counter')).toHaveCount(0);
  await request.getByTestId('newcomer-accept').click();
  await expect(panelA.getByTestId('house-vassal')).toHaveCount(1);

  // B je vazal A a jeho mapa leží u mapy A
  const [vassalage] = await query<{ lord_house_id: string }>(
    `SELECT lord_house_id FROM vassalage WHERE vassal_house_id = $1 AND ended_at IS NULL`,
    [(await houseOf(emailB)).id],
  );
  expect(vassalage?.lord_house_id).toBe(houseA.id);
  expect((await houseOf(emailB)).placed).toBe(true);
  const cellB = await worldCellOf(emailB);
  expect(cellB).not.toBeNull();
  expect(
    Math.max(Math.abs(cellB!.x - cellA!.x), Math.abs(cellB!.y - cellA!.y)),
  ).toBeLessThanOrEqual(4);
  const panelB2 = await openHousePanel(b);
  await expect(panelB2.getByTestId('house-lord')).toHaveCount(1);
  await expect(panelB2.getByTestId('house-newcomer')).toHaveCount(0);
  await expect(b.getByTestId('minimap-panel')).not.toHaveAttribute('data-isolated', 'true');

  // C: Svobodný → hned na mapě světa, pak jméno vojvody
  const emailC = await enterAsNewcomer(c, 'nc-svobodny');
  const choiceC = c.getByTestId('newcomer-choice');
  await expect(choiceC).toBeVisible({ timeout: 60_000 });
  await choiceC.getByTestId('newcomer-free').click();
  await expect(choiceC).toHaveCount(0, { timeout: 30_000 });
  await expect(c.getByTestId('line-name-panel')).toBeVisible({ timeout: 30_000 });
  expect((await houseOf(emailC)).placed).toBe(true);
  expect(await worldCellOf(emailC)).not.toBeNull();

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});
