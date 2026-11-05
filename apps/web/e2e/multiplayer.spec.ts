import { test, expect, type Page } from '@playwright/test';
import { registerAndEnterGame, uniqueEmail, useUniqueClientIp } from './helpers';
import { linkFromLastMail } from './mail';
import { found, newPlayer, pollVillage, query, villageSpots } from './village-helpers';

// Víc hráčů ve světě (vassalage.md): pozvánka → pozvaný je vazal pozvatele, pozvatel dostane
// upozornění a vazala v panelu „Rod a vazalové“; cizí hráč bez pozvánky vidí oba v seznamu hráčů.

const SCREENSHOT = process.env.HOUSE_PANEL_SCREENSHOT;

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
