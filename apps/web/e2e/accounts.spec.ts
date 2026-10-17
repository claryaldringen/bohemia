import { test, expect } from '@playwright/test';
import { login, register, signOut, uniqueEmail, useUniqueClientIp } from './helpers';
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
  // Kdo je přihlášený, prozradí popisek tlačítka Odhlásit v horní liště.
  await page.getByRole('button', { name: 'Odhlásit' }).hover();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByTestId('game-date')).toHaveText(
    /^\d+\. \p{L}+ \d+ · (jaro|léto|podzim|zima)$/u,
  );

  await signOut(page);
  await page.goto('/game');
  await expect(page).toHaveURL(/\/login$/);

  await login(page, email, 'tajne-heslo-123');
  await expect(page).toHaveURL(/\/game$/);
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
