import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from '../playwright.config';
import { login, openGameMenu, register, signOut, uniqueEmail, useUniqueClientIp } from './helpers';
import { linkFromLastMail } from './mail';

test.beforeEach(async ({ context }) => {
  await useUniqueClientIp(context);
});

test('nepřihlášeného pošle herní plocha na přihlášení', async ({ page }) => {
  await page.goto('/game');
  await expect(page).toHaveURL(/\/login$/);
});

test('registrace → ověření e-mailu → herní plocha → odhlášení → přihlášení', async ({ page }) => {
  const email = uniqueEmail('novy-hrac');
  await register(page, email, 'tajne-heslo-123');

  // Před ověřením e-mailu se přihlásit nejde.
  await login(page, email, 'tajne-heslo-123');
  await expect(page.getByText('Nejdřív potvrď e-mail')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // Odkaz z e-mailu hráče ověří a rovnou přihlásí.
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await expect(page).toHaveURL(/\/game$/);
  // Kdo je přihlášený, prozradí popisek tlačítka Odhlásit v nabídce hry.
  const menu = await openGameMenu(page);
  await menu.getByRole('button', { name: 'Odhlásit' }).hover();
  await expect(page.getByText(email)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('game-date')).toHaveText(
    /^\d+\. \p{L}+ \d+ · (jaro|léto|podzim|zima)$/u,
  );

  await signOut(page);
  await page.goto('/game');
  await expect(page).toHaveURL(/\/login$/);

  await login(page, email, 'tajne-heslo-123');
  await expect(page).toHaveURL(/\/game$/);
});

test('jazyk z registrace dostane účet i rod', async ({ page }) => {
  const email = uniqueEmail('jazyk');
  await register(page, email, 'tajne-heslo-123', 'de');
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await expect(page).toHaveURL(/\/game$/);
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await expect
      .poll(async () => {
        const { rows } = await client.query(
          `SELECT u.language AS account, h.language AS house FROM "user" u
           LEFT JOIN house h ON h.player_id = u.id AND h.ended_at IS NULL WHERE u.email = $1`,
          [email],
        );
        return rows[0] as { account: string; house: string | null } | undefined;
      })
      .toEqual({ account: 'de', house: 'de' });
    // změna účtu přes Better Auth jazyk nezmění (mění ho jen volba jazyka ve hře)
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jazykový test', language: 'cs' }),
      });
      return response.status;
    });
    expect(status).toBe(200);
    const { rows } = await client.query(`SELECT name, language FROM "user" WHERE email = $1`, [
      email,
    ]);
    expect(rows[0]).toEqual({ name: 'Jazykový test', language: 'de' });
  } finally {
    await client.end();
  }
});

test('špatné heslo nepřihlásí', async ({ page }) => {
  const email = uniqueEmail('spatne-heslo');
  await register(page, email, 'spravne-heslo-1');
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await signOut(page);

  await login(page, email, 'uplne-jine-heslo');
  await expect(page.getByText('Nesprávný e-mail nebo heslo')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('zapomenuté heslo – nové heslo platí, staré ne', async ({ page }) => {
  const email = uniqueEmail('zapomnetlivy');
  await register(page, email, 'puvodni-heslo-1');
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await signOut(page);

  await page.goto('/login');
  await page.getByRole('link', { name: 'Zapomenuté heslo?' }).click();
  // Přihlašovací stránka má taky pole „E-mail“ – vyplňovat až po dokončení přechodu.
  await expect(page.getByRole('heading', { name: 'Zapomenuté heslo' })).toBeVisible();
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Poslat odkaz' }).click();
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();

  await page.goto(await linkFromLastMail(email, /nového hesla/));
  await page.getByLabel('Nové heslo').fill('nove-heslo-456');
  await page.getByRole('button', { name: 'Nastavit heslo' }).click();
  await expect(page.getByText('Heslo je změněné')).toBeVisible();

  await login(page, email, 'puvodni-heslo-1');
  await expect(page.getByText('Nesprávný e-mail nebo heslo')).toBeVisible();
  await login(page, email, 'nove-heslo-456');
  await expect(page).toHaveURL(/\/game$/);
});

test('registrace už existujícího e-mailu neprozradí, že účet existuje', async ({ page }) => {
  const email = uniqueEmail('existujici');
  await register(page, email, 'prvni-heslo-1');
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await signOut(page);

  // register() ověřuje stejné potvrzení „Zkontroluj e-mail“ jako u nové registrace –
  // při chybě typu „účet už existuje“ by se neukázalo.
  await register(page, email, 'druhe-heslo-2');

  // Původní heslo platí dál, pokus o „přeregistrování“ nic nezměnil.
  await login(page, email, 'prvni-heslo-1');
  await expect(page).toHaveURL(/\/game$/);
});

/** Vydavatel a jeden jeho platný kód přímo v testovací DB (vydávání patří do hry, tady jde o registraci). */
async function seedInvite(code: string): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const issuer = `issuer-${code}`;
  await client.query(
    `INSERT INTO "user" (id, name, email) VALUES ($1, '', $2) ON CONFLICT DO NOTHING`,
    [issuer, `${issuer}@example.com`],
  );
  await client.query(
    `INSERT INTO invite_code (code, issuer_id, created_at, valid_until)
     VALUES ($1, $2, now(), now() + interval '14 days')`,
    [code, issuer],
  );
  await client.end();
}

async function reservedBy(code: string): Promise<string | null> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `SELECT u.email FROM invite_code i LEFT JOIN "user" u ON u.id = i.reserved_by WHERE i.code = $1`,
    [code],
  );
  await client.end();
  return (rows[0]?.email as string | null | undefined) ?? null;
}

test('registrace s platnou pozvánkou ji zarezervuje (kód z odkazu se předvyplní)', async ({
  page,
}) => {
  const code = 'E2ETEST2';
  await seedInvite(code);
  const email = uniqueEmail('pozvany');
  await page.goto(`/register?pozvanka=${code}`);
  await expect(page.getByLabel('Pozvánka')).toHaveValue(code);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill('pozvany-heslo-1');
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();
  expect(await reservedBy(code)).toBe(email);
});

test('registrace s neplatnou pozvánkou ohlásí chybu u pole a projde bez ní', async ({ page }) => {
  const email = uniqueEmail('neplatna');
  await page.goto('/register');
  await page.getByLabel('Pozvánka').fill('ZZZZ-ZZZZ');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill('neplatna-heslo-1');
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  // Registrace jde dál (potvrzení e-mailu) a hláška o pozvánce zůstane vidět.
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();
  await expect(page.getByText('Pozvánka neplatí.')).toBeVisible();
});
