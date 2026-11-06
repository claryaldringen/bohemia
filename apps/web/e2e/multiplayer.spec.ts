import { test, expect, type Page } from '@playwright/test';
import { registerAndEnterGame, uniqueEmail, useUniqueClientIp } from './helpers';
import { linkFromLastMail } from './mail';
import {
  confirmPlacement,
  found,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  villageOnNextMap,
  villageSpots,
  villageState,
  writeVillageState,
} from './village-helpers';

// Víc hráčů ve světě (vassalage.md): pozvánka → pozvaný je vazal pozvatele, pozvatel dostane
// upozornění a vazala v panelu „Rod a vazalové“; cizí hráč bez pozvánky vidí oba v seznamu hráčů.

type VillageStateJson = Awaited<ReturnType<typeof villageState>>;

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

  // C blokování zruší → A smí zase nabízet
  const panelC3 = await reopenHousePanel(c);
  const barC2 = await pickPlayer(panelC3, idA);
  await expect(barC2.getByTestId('house-block')).toHaveCount(0);
  await barC2.getByTestId('house-unblock').click();
  const panelA6 = await reopenHousePanel(a);
  const barA6 = await pickPlayer(panelA6, idC);
  await expect(barA6.getByTestId('house-request')).not.toHaveAttribute(
    'data-reason',
    'Zablokoval tě.',
  );

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

test('pomoc na žádost: B požádá A o obilí, A dá půjčku, B přijme → zásilka a řádek splátky v Odvodech', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { seat: seatA } = await newPlayer(a, 'pomoca');
  await found(a, villageSpots(seatA.landscape).dwelling);
  const { email: emailB, seat: seatB } = await newPlayer(b, 'pomocb');
  await found(b, villageSpots(seatB.landscape).dwelling, 'Ctibor');
  const idB = await houseIdOf(emailB);

  // A přijme B za vazala (holá přísaha)
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idB);
  await bar.getByTestId('house-offer').click();
  await panelA.getByTestId('terms-submit').click();
  const panelB = await reopenHousePanel(b);
  await panelB.getByTestId('negotiation-accept').click();
  await expect(panelB.getByTestId('house-lord')).toHaveCount(1);

  // čerstvá ves nemá společnou práci, z níž se platí doprava – dopřejeme ji věřiteli
  await query(
    `UPDATE village SET state = jsonb_set(state, '{commonLaborYearly}', '30'),
            version = version + 1, digest_version = version + 1
      WHERE settlement_id = $1`,
    [seatA.settlementId],
  );

  // B požádá pána o pomoc: 6 kg obilí
  await panelB.getByTestId('house-lord').click();
  await panelB.getByTestId('agreement-request-aid').click();
  await panelB.getByTestId('term-aid-request-grainKg').fill('6');
  await panelB.getByTestId('terms-message').fill('Neúroda');
  await panelB.getByTestId('terms-submit').click();

  // A odpoví půjčkou se splátkou
  const panelA2 = await reopenHousePanel(a);
  await expect(panelA2.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await panelA2.getByTestId('negotiation-counter').click();
  await panelA2.getByTestId('terms-aid-loan').click();
  await expect(panelA2.getByTestId('term-loan-year-0')).toBeVisible();
  await panelA2.getByTestId('terms-submit').click();

  // B půjčku přijme
  const panelB2 = await reopenHousePanel(b);
  await expect(panelB2.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await expect(panelB2.getByTestId('term-row-loan')).toBeVisible();
  await panelB2.getByTestId('negotiation-accept').click();
  await expect(panelB2.getByTestId('house-negotiation')).toHaveCount(0);

  // vznikla půjčka a zásilka z věřitelovy vsi, se dnem příjezdu
  const [loan] = await query<{ id: string; year: number }>(
    `SELECT id, (schedule->0->>'year')::int AS year FROM loan WHERE debtor_house_id = $1`,
    [idB],
  );
  expect(loan).toBeDefined();
  const shipments = await query<{ arrives_day: number }>(
    `SELECT s.arrives_day FROM shipment s JOIN village v ON v.id = s.from_village_id
      WHERE v.settlement_id = $1`,
    [seatA.settlementId],
  );
  expect(shipments).toHaveLength(1);
  expect(shipments[0]!.arrives_day).toBeGreaterThan(0);

  // další Odvody: worker otevře dialog splátky (zde zápisem) a B ho vidí jako řádek splátky
  const [owner] = await query<{ player_id: string }>(`SELECT player_id FROM house WHERE id = $1`, [
    idB,
  ]);
  await query(
    `INSERT INTO dialog (player_id, kind, key, ref_id, year, body)
     VALUES ($1, 'repay', $2, $3, $4, '{}'::jsonb)`,
    [owner!.player_id, `repay:${loan!.id}:${loan!.year}`, loan!.id, loan!.year],
  );
  await query(
    `INSERT INTO player_notice (player_id, kind, payload, game_day)
     VALUES ($1, 'levy-pending', '{"lordName":"Pán","years":1,"loan":true}'::jsonb, 0)`,
    [owner!.player_id],
  );
  await pollVillage(b);
  await b.getByTestId('village-notice').filter({ hasText: 'splátky' }).click();
  const dialog = b.getByRole('dialog', { name: 'Odvody' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-testid$="-kind"]')).toBeVisible();

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('obchod mezi hráči: A nabídne C obilí za klády, C přijme → oba mají dialog, A pošle celé, C míň', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, c]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'obchoda');
  await found(a, villageSpots(seatA.landscape).dwelling, 'Bořivoj');
  const { email: emailC, seat: seatC } = await newPlayer(c, 'obchodc');
  await found(c, villageSpots(seatC.landscape).dwelling, 'Dalibor');
  const idC = await houseIdOf(emailC);
  const idA = await houseIdOf(emailA);

  // čerstvé vsi nemají společnou práci, z níž se platí doprava – dopřejeme ji oběma
  for (const settlementId of [seatA.settlementId, seatC.settlementId]) {
    await query(
      `UPDATE village SET state = jsonb_set(state, '{commonLaborYearly}', '30'),
              version = version + 1, digest_version = version + 1
        WHERE settlement_id = $1`,
      [settlementId],
    );
  }
  // C má co poslat za obilí: čerstvá ves nemá žádné klády
  await query(
    `UPDATE village SET state = jsonb_set(state, '{woodLogs}', '10'),
            version = version + 1, digest_version = version + 1
      WHERE settlement_id = $1`,
    [seatC.settlementId],
  );

  // A nabídne C obchod bez vazalství: dá 6 kg obilí, dostane 4 klády
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idC);
  await bar.getByTestId('house-trade').click();
  await panelA.getByTestId('term-trade-give-grainKg').fill('6');
  await panelA.getByTestId('term-trade-get-logs').fill('4');
  await panelA.getByTestId('terms-submit').click();

  // C vidí obchod z druhé strany (dá klády, dostane obilí) a přijme
  const panelC = await reopenHousePanel(c);
  const card = panelC.getByTestId('house-negotiation');
  await expect(card).toHaveAttribute('data-my-turn', 'true');
  await expect(card.getByTestId('term-row-trade')).toBeVisible();
  await panelC.getByTestId('negotiation-accept').click();
  await expect(panelC.getByTestId('house-negotiation')).toHaveCount(0);
  // obchod nevyžaduje vazalství
  await expect(panelC.getByTestId('house-lord')).toHaveCount(0);

  // oba mají dialog odeslání
  const dialogs = await query<{ player_id: string }>(
    `SELECT player_id FROM dialog WHERE kind = 'trade-send' AND status = 'open'`,
    [],
  );
  expect(dialogs).toHaveLength(2);

  // A otevře dialog z upozornění a pošle celé
  await pollVillage(a);
  await a.getByTestId('village-notice').filter({ hasText: 'čeká odeslání zboží' }).click();
  const dialogA = a.getByRole('dialog', { name: 'Odvody' });
  await expect(dialogA).toBeVisible();
  await dialogA.locator('input[type="range"]').fill('6');
  await dialogA.getByRole('button', { name: 'Odeslat' }).click();
  await expect(dialogA.locator('[data-testid$="-sent"]')).toBeVisible({ timeout: 30_000 });

  // C pošle míň (2 z 4 klád)
  await pollVillage(c);
  await c.getByTestId('village-notice').filter({ hasText: 'čeká odeslání zboží' }).click();
  const dialogC = c.getByRole('dialog', { name: 'Odvody' });
  await expect(dialogC).toBeVisible();
  await dialogC.locator('input[type="range"]').fill('2');
  await dialogC.getByRole('button', { name: 'Odeslat' }).click();
  await expect(dialogC.locator('[data-testid$="-sent"]')).toBeVisible({ timeout: 30_000 });

  // zásilky vznikly: A → C obilí, C → A klády; upozornění dorazila
  const shipments = await query<{ purpose: string; to_village: string }>(
    `SELECT s.purpose, v.settlement_id AS to_village FROM shipment s
       JOIN village v ON v.id = s.to_village_id WHERE s.purpose = 'trade'`,
    [],
  );
  expect(shipments.map((s) => s.to_village).sort()).toEqual(
    [seatA.settlementId, seatC.settlementId].sort(),
  );
  await pollVillage(c);
  await expect(c.getByTestId('village-notice').filter({ hasText: 'zboží z obchodu' })).toBeVisible({
    timeout: 60_000,
  });
  await pollVillage(a);
  await expect(
    a.getByTestId('village-notice').filter({ hasText: 'Míň, než bylo domluveno' }),
  ).toBeVisible({ timeout: 60_000 });
  expect(idA).not.toBe(idC);

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('správa cizí vsi: A svěří B ves, B v ní postaví pole, A ho odvolá → ves zmizí z přepínače B', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { seat: seatA } = await newPlayer(a, 'spravaa');
  const spotsA = villageSpots(seatA.landscape);
  await found(a, spotsA.dwelling, 'Bořivoj');
  const { email: emailB, seat: seatB } = await newPlayer(b, 'spravab');
  await found(b, villageSpots(seatB.landscape).dwelling, 'Dalibor');
  const idB = await houseIdOf(emailB);
  const [villageA] = await query<{ id: string; name: string }>(
    `SELECT id, name FROM village WHERE settlement_id = $1`,
    [seatA.settlementId],
  );
  const [villageB] = await query<{ id: string; name: string }>(
    `SELECT id, name FROM village WHERE settlement_id = $1`,
    [seatB.settlementId],
  );

  // A nabídne B vazalství i správu své vsi
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idB);
  await bar.getByTestId('house-offer').click();
  await panelA.getByTestId('terms-add-stewardship').click();
  await expect(panelA.getByTestId('term-stewardship-select')).toHaveValue(villageA!.id);
  await panelA.getByTestId('terms-submit').click();

  // B přijme → správa vsi A je živá
  const panelB = await reopenHousePanel(b);
  await expect(panelB.getByTestId('house-negotiation')).toHaveAttribute('data-my-turn', 'true');
  await expect(panelB.getByTestId('term-row-stewardship')).toBeVisible();
  await panelB.getByTestId('negotiation-accept').click();
  await expect(panelB.getByTestId('house-negotiation')).toHaveCount(0);
  const live = await query<{ village_id: string }>(
    `SELECT village_id FROM stewardship WHERE ended_at IS NULL`,
    [],
  );
  expect(live.map((s) => s.village_id)).toEqual([villageA!.id]);

  // B ves A v přepínači s klíčem; přepne na ni a postaví pole (pod zámkem držitele)
  await b.reload();
  const name = b.getByTestId('village-name');
  await expect(name).toHaveText(villageB!.name, { timeout: 30_000 });
  await name.click();
  const list = b.getByTestId('village-list');
  const entry = list.locator(`[data-village="${villageA!.id}"]`);
  await expect(entry.getByTestId('steward-key')).toBeVisible();
  await entry.getByTestId('village-select').click();
  await expect(readyScene(b)).toBeVisible({ timeout: 60_000 });
  await expect(name).toHaveText(villageA!.name, { timeout: 30_000 });
  await b.keyboard.press('c');
  await confirmPlacement(b, { kind: 'squares', cells: spotsA.cells });
  await expect.poll(async () => (await villageState(seatA.settlementId)).fields.length).toBe(1);

  // A odvolá B: správa skončí, vazalství trvá
  const panelA2 = await reopenHousePanel(a);
  await panelA2.getByTestId(`steward-dismiss-${villageA!.id}`).click();
  await expect
    .poll(async () => (await query(`SELECT 1 FROM stewardship WHERE ended_at IS NULL`, [])).length)
    .toBe(0);
  const agreements = await query(
    `SELECT 1 FROM vassalage WHERE ended_at IS NULL AND vassal_house_id = $1`,
    [idB],
  );
  expect(agreements).toHaveLength(1);

  // B už ves A v přepínači nemá a otevře zase svou vlastní
  await b.reload();
  await expect(name).toHaveText(villageB!.name, { timeout: 30_000 });
  await name.click();
  await expect(list.locator(`[data-village="${villageA!.id}"]`)).toHaveCount(0);
  await expect(list.getByRole('option')).toHaveCount(1);
  // pole zůstalo, další akce B ve vsi A už nejsou
  expect((await villageState(seatA.settlementId)).fields).toHaveLength(1);

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('povýšení vesničana: hráč povýší rolníka pro druhou ves bez vojvody → NPC vazal v panelu rodu a ves má klíč', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctx = await browser.newContext();
  await useUniqueClientIp(ctx);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  const { email, seat: seatA } = await newPlayer(page, 'povyseni');
  await found(page, villageSpots(seatA.landscape).dwelling, 'Bořivoj');
  const houseId = await houseIdOf(email);

  // druhá ves hráče je bez vojvody (přímý zápis do bohemia_test) a čeká na vojvodu
  const second = await villageOnNextMap(seatA.settlementId, 'Lhota');
  const [secondRow] = await query<{ settlement_id: string }>(
    `SELECT settlement_id FROM village WHERE id = $1`,
    [second.id],
  );
  const waiting = await query<{ state: VillageStateJson }>(
    `SELECT state FROM village WHERE id = $1`,
    [second.id],
  );
  const empty = waiting[0]!.state;
  for (const p of empty.people) delete p.line;
  empty.dynasty = {
    lordId: null,
    lords: [{ id: 1, fromDay: 0, toDay: empty.lastDay }],
    endedDay: empty.lastDay,
  };
  empty.awaitingLord = { sinceDay: empty.lastDay };
  await writeVillageState(secondRow!.settlement_id, empty);

  // v první vsi přibude dospělý rolník (muž mimo rod vojvody)
  const state = await villageState(seatA.settlementId);
  const lord = state.people.find((p) => p.id === state.dynasty!.lordId)!;
  const farmerId = Math.max(...state.people.map((p) => p.id)) + 1;
  const farmer = { ...lord, id: farmerId, bornDay: state.lastDay - 30 * 365 };
  delete farmer.line;
  delete farmer.name;
  delete farmer.spouseId;
  delete farmer.arms;
  state.people.push(farmer);
  state.nextId = Math.max(state.nextId, farmerId + 1);
  await writeVillageState(seatA.settlementId, state);
  await pollVillage(page);

  await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), farmerId);
  const selection = page.getByTestId('selection-panel');
  await expect(selection.getByTestId('selection-person-ennoble')).toBeVisible({ timeout: 30_000 });
  await selection.getByTestId('selection-person-ennoble').click();

  // vznikl NPC rod, holá přísaha a správa; muž z první vsi odešel
  await expect
    .poll(async () => (await query(`SELECT 1 FROM house WHERE kind = 'npc'`, [])).length)
    .toBe(1);
  const agreements = await query<{ origin: string; terms: unknown }>(
    `SELECT origin, terms FROM vassalage WHERE ended_at IS NULL AND lord_house_id = $1`,
    [houseId],
  );
  expect(agreements).toEqual([{ origin: 'ennoble', terms: {} }]);
  const stewards = await query<{ village_id: string; kind: string }>(
    `SELECT village_id, kind FROM stewardship WHERE ended_at IS NULL`,
    [],
  );
  expect(stewards).toEqual([{ village_id: second.id, kind: 'npc' }]);
  expect((await villageState(seatA.settlementId)).people.some((p) => p.id === farmerId)).toBe(
    false,
  );

  // v panelu rodu je NPC vazal; ves v přepínači má klíč
  const panel = await reopenHousePanel(page);
  await expect(panel.getByTestId('house-vassal')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByTestId('village-name').click();
  const entry = page.getByTestId('village-list').locator(`[data-village="${second.id}"]`);
  await expect(entry.getByTestId('npc-steward-key')).toBeVisible();
  await ctx.close();
});

test('válka: nový rod je pod ochranou, po jejím vypršení A opoví válku C → C vidí upozornění a oštěpy v liště', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, c]) await page.setViewportSize({ width: 1280, height: 720 });
  const { seat: seatA } = await newPlayer(a, 'valkaa');
  await found(a, villageSpots(seatA.landscape).dwelling, 'Bořivoj');
  const { email: emailC, seat: seatC } = await newPlayer(c, 'valkac');
  await found(c, villageSpots(seatC.landscape).dwelling, 'Dalibor');
  const idC = await houseIdOf(emailC);

  // čerstvý rod je chráněn: štít s hodinami v liště, opověď zašedlá s důvodem
  await expect(c.getByTestId('protection-shield')).toBeVisible();
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idC);
  await expect(bar.getByTestId('house-war')).toBeDisabled();
  await expect(bar.getByTestId('house-war')).toHaveAttribute(
    'data-reason',
    /je pod ochranou ještě \d+ (den|dny|dní)\./,
  );

  // ochrana vyprší (rody jsou „staré“ 30 dní) → opověď projde
  await query(
    `UPDATE house SET created_at = now() - interval '30 days' WHERE ended_at IS NULL`,
    [],
  );
  const panelA2 = await reopenHousePanel(a);
  const bar2 = await pickPlayer(panelA2, idC);
  await expect(bar2.getByTestId('house-war')).toBeEnabled();
  await bar2.getByTestId('house-war').click();
  await panelA2.getByTestId('terms-message').fill('Chci na vás jít');
  await panelA2.getByTestId('terms-submit').click();

  // A má v liště jednu válku a panel války s řádkem
  await expect(a.getByTestId('war-count')).toHaveAttribute('data-wars', '1', { timeout: 30_000 });
  await a.getByTestId('war-toggle').click();
  await expect(a.getByTestId('war-row')).toHaveCount(1);

  // C dostane upozornění a vidí oštěpy s jednou válkou
  // upozornění mizí po pár sekundách – dotaz se opakuje, dokud ho C nezachytí
  await expect(async () => {
    await pollVillage(c);
    await expect(c.getByTestId('village-notice').filter({ hasText: 'opověděl válku' })).toBeVisible(
      {
        timeout: 2_000,
      },
    );
  }).toPass({ timeout: 60_000, intervals: [500] });
  await expect(c.getByTestId('war-count')).toHaveAttribute('data-wars', '1');
  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('mír: A a C jsou ve válce, C nabídne mír s poplatkem, A přijme → válka skončila mírem a C má dialog poplatku', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, c]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'mira');
  await found(a, villageSpots(seatA.landscape).dwelling, 'Bořivoj');
  const { email: emailC, seat: seatC } = await newPlayer(c, 'mirc');
  await found(c, villageSpots(seatC.landscape).dwelling, 'Dalibor');
  const idC = await houseIdOf(emailC);
  const idA = await houseIdOf(emailA);

  // ochrana vyprší a A opoví válku C
  await query(
    `UPDATE house SET created_at = now() - interval '30 days' WHERE ended_at IS NULL`,
    [],
  );
  const panelA = await openHousePanel(a);
  const bar = await pickPlayer(panelA, idC);
  await bar.getByTestId('house-war').click();
  await panelA.getByTestId('terms-submit').click();
  await expect(a.getByTestId('war-count')).toHaveAttribute('data-wars', '1', { timeout: 30_000 });

  // C nabídne mír s poplatkem 4 kg obilí, který zaplatí sám
  await pollVillage(c);
  await expect(c.getByTestId('war-count')).toHaveAttribute('data-wars', '1', { timeout: 30_000 });
  await c.getByTestId('war-toggle').click();
  await c.getByTestId('war-offer-peace').click();
  // jedinou vsi rodu postoupit nejde (poslední mapa) – volba je zašedlá
  await c.getByTestId('peace-cede-side').selectOption('own');
  await expect(c.getByTestId('peace-cede-village')).toBeDisabled();
  await c.getByTestId('peace-cede-side').selectOption('none');
  await c.getByTestId('peace-fee').fill('4');
  await c.getByTestId('peace-send').click();

  // A vidí mírové jednání a přijme
  const panelA2 = await reopenHousePanel(a);
  const card = panelA2.getByTestId('house-negotiation');
  await expect(card).toHaveAttribute('data-my-turn', 'true');
  await expect(card.getByTestId('term-row-peace')).toBeVisible();
  await panelA2.getByTestId('negotiation-accept').click();
  await expect(panelA2.getByTestId('house-negotiation')).toHaveCount(0);

  // válka skončila mírem, C má otevřený dialog poplatku
  const wars = await query<{ status: string }>(
    `SELECT status FROM war WHERE house_low = ANY($1) AND house_high = ANY($1)`,
    [[idA, idC]],
  );
  expect(wars).toEqual([{ status: 'peace' }]);
  const dialogs = await query<{ kind: string }>(
    `SELECT kind FROM dialog WHERE status = 'open' AND player_id = (SELECT player_id FROM house WHERE id = $1)`,
    [idC],
  );
  expect(dialogs).toEqual([{ kind: 'fee-send' }]);
  await pollVillage(c);
  await expect(c.getByTestId('village-notice').filter({ hasText: 'Mír s' })).toBeVisible({
    timeout: 60_000,
  });
  await Promise.all(ctxs.map((ctx) => ctx.close()));
});
