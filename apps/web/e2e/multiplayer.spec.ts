import { test, expect, type Page } from '@playwright/test';
import { registerAndEnterGame, uniqueEmail, useUniqueClientIp } from './helpers';
import { linkFromLastMail } from './mail';
import { found, newPlayer, pollVillage, query, villageSpots } from './village-helpers';

// Víc hráčů ve světě (vassalage.md): pozvánka → pozvaný je vazal pozvatele, pozvatel dostane
// upozornění a vazala v panelu „Rod a vazalové“; cizí hráč bez pozvánky vidí oba v seznamu hráčů.

const SCREENSHOT = process.env.HOUSE_PANEL_SCREENSHOT;
const NEGOTIATION_SCREENSHOT = process.env.NEGOTIATION_SCREENSHOT;
const LEVY_SCREENSHOT = process.env.LEVY_SCREENSHOT;

async function openHousePanel(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const panel = page.getByRole('dialog', { name: 'Rod a vazalové' });
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: 'Rod a vazalové' }).click();
  await expect(panel).toBeVisible();
  return panel;
}

test('pozvánka: pozvaný je vazal, pozvatel má vazala a upozornění, cizí hráč vidí oba', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // Seznam hráčů ukazuje jen nejbližších 12 rodů – rody z dřívějších testů sdílené databáze by
  // A a B mohly vytlačit, proto je tu ukončíme (zápisem konce rodu, data zůstanou).
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  for (const ctx of [ctxA, ctxB, ctxC]) await useUniqueClientIp(ctx);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const c = await ctxC.newPage();
  await a.setViewportSize({ width: 1280, height: 720 });

  // A: vstoupí do hry, založí ves (upozornění mezi hráči se doručují s dotazem na ves) a vydá
  // pozvánku
  const { seat } = await newPlayer(a, 'pozvatel');
  await found(a, villageSpots(seat.landscape).dwelling);
  const panelA = await openHousePanel(a);
  await expect(panelA.getByTestId('house-independent')).toBeVisible();
  await expect(panelA.getByTestId('house-invite-slots')).toHaveText('3');
  await panelA.getByTestId('house-invite-issue').click();
  await expect(panelA.getByTestId('house-invite-open')).toHaveCount(1);
  await expect(panelA.getByTestId('house-invite-slots')).toHaveText('2');
  const code = (await panelA.getByTestId('house-invite-code').innerText()).replace('-', '');
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // B: registrace s kódem z odkazu
  const emailB = uniqueEmail('pozvany');
  await b.goto(`/register?pozvanka=${code}`);
  await expect(b.getByLabel('Pozvánka')).toHaveValue(code);
  await b.getByLabel('E-mail').fill(emailB);
  await b.getByLabel('Heslo').fill('pozvany-heslo-1');
  await b.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(b.getByText('Zkontroluj e-mail')).toBeVisible();
  await b.goto(await linkFromLastMail(emailB, /potvrď svůj e-mail/));
  await expect(b).toHaveURL(/\/game$/);

  // B má A v pánech
  const panelB = await openHousePanel(b);
  await expect(panelB.getByTestId('house-lord')).toHaveCount(1);
  await expect(panelB.getByTestId('house-independent')).toHaveCount(0);

  // A má B ve vazalech a upozornění; použitá pozvánka je vidět
  await pollVillage(a);
  await expect(a.getByTestId('village-notice').filter({ hasText: 'přijal pozvánku' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(a.getByTestId('house-vassal-count')).toHaveText('1');
  const panelA2 = await openHousePanel(a);
  await expect(panelA2.getByTestId('house-vassal')).toHaveCount(1);
  await expect(panelA2.getByTestId('house-invite-used')).toHaveCount(1);

  // C bez kódu: nezávislý, v seznamu hráčů vidí A i B
  await registerAndEnterGame(c, 'cizinec');
  const panelC = await openHousePanel(c);
  await expect(panelC.getByTestId('house-independent')).toBeVisible();
  await expect(panelC.getByTestId('house-other')).toHaveCount(2);

  // A po znovuotevření vidí i C; snímek panelu pro kontrolu vzhledu
  await a.getByRole('button', { name: 'Rod a vazalové' }).click();
  const panelA3 = await openHousePanel(a);
  await expect(panelA3.getByTestId('house-other')).toHaveCount(1);
  await a.mouse.move(0, 400);
  if (SCREENSHOT) await a.screenshot({ path: SCREENSHOT });

  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
});

/** Obnoví panel (data se načítají při otevření): zavře ho a otevře znovu. */
async function reopenHousePanel(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const panel = page.getByRole('dialog', { name: 'Rod a vazalové' });
  if (await panel.isVisible()) await page.getByRole('button', { name: 'Rod a vazalové' }).click();
  return openHousePanel(page);
}

async function houseIdOf(email: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `SELECT h.id FROM house h JOIN "user" u ON u.id = h.player_id
      WHERE u.email = $1 AND h.ended_at IS NULL`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá rod.`);
  return row.id;
}

/** Klikne na cizího hráče v seznamu a vrátí lištu jeho akcí. */
async function pickPlayer(
  panel: ReturnType<Page['getByRole']>,
  houseId: string,
): Promise<ReturnType<Page['getByTestId']>> {
  await panel.locator(`[data-testid="house-other"][data-house-id="${houseId}"]`).click();
  const actions = panel.getByTestId('house-actions');
  await expect(actions).toBeVisible();
  return actions;
}

async function send(panel: ReturnType<Page['getByRole']>, message: string): Promise<void> {
  await panel.getByTestId('terms-message').fill(message);
  await panel.getByTestId('terms-submit').click();
}

test('jednání: nabídka, protinávrh, přijetí; odmítnutí s pauzou; blokování', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page, Page];
  for (const page of [a, b, c]) await page.setViewportSize({ width: 1280, height: 720 });
  const emailA = await registerAndEnterGame(a, 'jedna');
  const emailB = await registerAndEnterGame(b, 'jednb');
  const emailC = await registerAndEnterGame(c, 'jednc');
  const idB = await houseIdOf(emailB);
  const idC = await houseIdOf(emailC);
  const idA = await houseIdOf(emailA);

  // A nabídne vazalství B (pečeť + vzkaz); do dokončení odpovědi je nabídka zašedlá
  const panelA = await openHousePanel(a);
  const barA = await pickPlayer(panelA, idB);
  await barA.getByTestId('house-offer').click();
  await send(panelA, 'Pojď pod můj prapor');
  await expect(panelA.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'false');
  await expect(panelA.getByTestId('negotiation-withdraw')).toBeVisible();
  await pickPlayer(panelA, idB);
  await expect(panelA.getByTestId('house-offer')).toBeDisabled();
  await expect(panelA.getByTestId('house-offer')).toHaveAttribute('data-reason', 'Jednáte už.');

  // B vidí nabídku se vzkazem a dá protinávrh
  const panelB = await reopenHousePanel(b);
  const cardB = panelB.getByTestId('house-negotiation');
  await expect(cardB).toHaveAttribute('data-my-turn', 'true');
  await expect(cardB.getByTestId('house-negotiation-message')).toHaveText('Pojď pod můj prapor');
  await b.mouse.move(0, 400);
  if (NEGOTIATION_SCREENSHOT) await b.screenshot({ path: NEGOTIATION_SCREENSHOT });
  await cardB.getByTestId('negotiation-counter').click();
  await send(panelB, 'Souhlasím, ale pamatuj na mě');

  // A přijme protinávrh → B má A v pánech, A má B ve vazalech
  const panelA2 = await reopenHousePanel(a);
  await expect(panelA2.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await panelA2.getByTestId('negotiation-accept').click();
  await expect(panelA2.getByTestId('house-vassal')).toHaveCount(1);
  await expect(panelA2.getByTestId('house-negotiation')).toHaveCount(0);
  const panelB2 = await reopenHousePanel(b);
  await expect(panelB2.getByTestId('house-lord')).toHaveCount(1);
  await expect(panelB2.getByTestId('house-independent')).toHaveCount(0);

  // A nabídne vazalství C; C odmítne → A má pauzu a u kurzoru důvod
  const panelA3 = await reopenHousePanel(a);
  const barA3 = await pickPlayer(panelA3, idC);
  await barA3.getByTestId('house-offer').click();
  await send(panelA3, 'Přidej se');
  const panelC = await reopenHousePanel(c);
  await expect(panelC.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await panelC.getByTestId('negotiation-reject').click();
  await expect(panelC.getByTestId('house-negotiation')).toHaveCount(0);
  const panelA4 = await reopenHousePanel(a);
  const barA4 = await pickPlayer(panelA4, idC);
  await expect(barA4.getByTestId('house-offer')).toBeDisabled();
  await barA4.getByTestId('house-offer').hover({ force: true });
  await expect(
    barA4.getByTestId('house-offer').locator('xpath=..').getByTestId('rights-reason'),
  ).toHaveText('Odmítl – zkus zítra.');

  // C zablokuje A → A vidí „Zablokoval tě.“ (blokování má přednost před pauzou)
  const panelC2 = await reopenHousePanel(c);
  const barC = await pickPlayer(panelC2, idA);
  await barC.getByTestId('house-block').click();
  const panelA5 = await reopenHousePanel(a);
  const barA5 = await pickPlayer(panelA5, idC);
  await expect(barA5.getByTestId('house-offer')).toHaveAttribute('data-reason', 'Zablokoval tě.');
  await expect(barA5.getByTestId('house-request')).toHaveAttribute('data-reason', 'Zablokoval tě.');

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

const TERMS_SCREENSHOT = process.env.TERMS_SCREENSHOT;

test('podmínky vazalství: ikony v panelu, nové podmínky odmítnuty, vypovězení', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { seat } = await newPlayer(a, 'podmra');
  await found(a, villageSpots(seat.landscape).dwelling);
  const emailB = await registerAndEnterGame(b, 'podmrb');
  const idB = await houseIdOf(emailB);

  // A nabídne B vazalství s dávkou obilí a vojenskou službou
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idB);
  await bar.getByTestId('house-offer').click();
  await panelA.getByTestId('terms-add-tribute').click();
  await panelA.getByTestId('term-tribute-grainKg').fill('300');
  await panelA.getByTestId('terms-add-service').click();
  await panelA.getByTestId('term-service-men').fill('2');
  await panelA.getByTestId('term-service-days').fill('20');
  await panelA.getByTestId('terms-submit').click();

  // B vidí řádky jako ikony a přijme
  const panelB = await reopenHousePanel(b);
  await expect(panelB.getByTestId('term-row-tribute')).toBeVisible();
  await expect(panelB.getByTestId('term-row-service')).toContainText('2 × 20');
  await panelB.getByTestId('negotiation-accept').click();
  await expect(panelB.getByTestId('house-lord')).toHaveCount(1);

  // A: u B ikony podmínek
  const panelA2 = await reopenHousePanel(a);
  const entry = panelA2.getByTestId('house-vassal-entry');
  await expect(entry.locator('[data-chip="tribute-grainKg"]')).toContainText('300');
  await expect(entry.locator('[data-chip="service"]')).toContainText('2 × 20');
  await a.mouse.move(0, 400);
  if (TERMS_SCREENSHOT) await a.screenshot({ path: TERMS_SCREENSHOT });

  // A dá nové podmínky, B odmítne → podmínky beze změny
  await panelA2.getByTestId('house-vassal').click();
  await panelA2.getByTestId('agreement-new-terms').click();
  await panelA2.getByTestId('term-tribute-grainKg').fill('900');
  await panelA2.getByTestId('terms-submit').click();
  const panelB2 = await reopenHousePanel(b);
  await expect(panelB2.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await panelB2.getByTestId('negotiation-reject').click();
  await expect(panelB2.getByTestId('house-negotiation')).toHaveCount(0);
  const panelA3 = await reopenHousePanel(a);
  await expect(
    panelA3.getByTestId('house-vassal-entry').locator('[data-chip="tribute-grainKg"]'),
  ).toContainText('300');

  // B vypoví → A ho nemá ve vazalech a dostane upozornění
  await panelB2.getByTestId('house-lord').click();
  await panelB2.getByTestId('agreement-renounce').click();
  await panelB2.getByTestId('renounce-message').fill('Dost bylo');
  await panelB2.getByTestId('renounce-confirm').click();
  await expect(panelB2.getByTestId('house-independent')).toBeVisible();
  await pollVillage(a);
  await expect(
    a.getByTestId('village-notice').filter({ hasText: 'skončilo vypovězením' }),
  ).toBeVisible({
    timeout: 60_000,
  });
  const panelA4 = await reopenHousePanel(a);
  await expect(panelA4.getByTestId('house-vassal')).toHaveCount(0);

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('Odvody 1. 11.: vazal ubere obilí a odešle, pán dostane upozornění a přesýpací hodiny zmizí', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { seat: seatA } = await newPlayer(a, 'odvoda');
  await found(a, villageSpots(seatA.landscape).dwelling);
  const { email: emailB, seat: seatB } = await newPlayer(b, 'odvodb');
  await found(b, villageSpots(seatB.landscape).dwelling, 'Ctibor');
  const idB = await houseIdOf(emailB);

  // A nabídne B vazalství s dávkou obilí, B přijme
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idB);
  await bar.getByTestId('house-offer').click();
  await panelA.getByTestId('terms-add-tribute').click();
  await panelA.getByTestId('term-tribute-grainKg').fill('6');
  await panelA.getByTestId('terms-submit').click();
  const panelB = await reopenHousePanel(b);
  await panelB.getByTestId('negotiation-accept').click();
  await expect(panelB.getByTestId('house-lord')).toHaveCount(1);

  // 1. 11.: dialog Odvody zapíšeme přímo do databáze (otevírá ho worker, viz testy jádra)
  const [row] = await query<{ id: string; player_id: string }>(
    `SELECT v.id, h.player_id FROM vassalage v JOIN house h ON h.id = v.vassal_house_id
      WHERE v.vassal_house_id = $1 AND v.ended_at IS NULL`,
    [idB],
  );
  if (!row) throw new Error('Dohoda chybí.');
  await query(
    `INSERT INTO dialog (player_id, kind, key, ref_id, year, body)
     VALUES ($1, 'levy', $2, $3, 500, '{}'::jsonb)`,
    [row.player_id, `levy:${row.id}:500`, row.id],
  );

  // čerstvá ves nemá společnou práci, z níž se platí doprava dávky – dopřejeme jí ji zápisem
  await query(
    `UPDATE village SET state = jsonb_set(state, '{commonLaborYearly}', '30'), version = version + 1
      WHERE settlement_id = $1`,
    [seatB.settlementId],
  );

  // pán vidí u vazala přesýpací hodiny
  const panelA2 = await reopenHousePanel(a);
  await expect(panelA2.getByTestId('house-levy-wait')).toBeVisible();

  // vazal otevře dialog z pečeti, ubere obilí na 2 kg a odešle
  const panelB2 = await reopenHousePanel(b);
  await panelB2.getByTestId('house-levy-open').click();
  const dialog = b.getByRole('dialog', { name: 'Odvody' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="range"]').fill('2');
  await dialog.locator('textarea').fill('Tuhá zima');
  await b.mouse.move(0, 400);
  if (LEVY_SCREENSHOT) await b.screenshot({ path: LEVY_SCREENSHOT });
  await dialog.getByRole('button', { name: 'Odeslat' }).click();
  await expect(dialog.locator('[data-testid$="-sent"]')).toBeVisible({ timeout: 30_000 });

  // pán dostane upozornění se vzkazem a hodiny zmizí
  await pollVillage(a);
  await expect(a.getByTestId('village-notice').filter({ hasText: 'posílá odvod' })).toContainText(
    'Tuhá zima',
    { timeout: 60_000 },
  );
  const panelA3 = await reopenHousePanel(a);
  await expect(panelA3.getByTestId('house-levy-wait')).toHaveCount(0);

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});
