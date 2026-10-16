import { test, expect, type Page } from '@playwright/test';
import { linkFromLastMail } from './mail';

const uniqueEmail = (prefix: string): string => `${prefix}-${Date.now()}@example.com`;

// Better Auth omezuje počet pokusů o přihlášení na IP adresu (podle X-Forwarded-For).
// Každý test vystupuje jako jiný hráč z jiné adresy, jinak by se pokusy sčítaly napříč testy.
let testIndex = 0;
test.beforeEach(async ({ context }) => {
  testIndex++;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.0.${testIndex}.${Date.now() % 250}` });
});

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Registrace' }).click();
  await expect(page.getByRole('heading', { name: 'Registrace' })).toBeVisible();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
}

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
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Svět začne 1. 1. 2100')).toBeVisible();

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
