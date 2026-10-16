import { expect, type BrowserContext, type Page } from '@playwright/test';
import { linkFromLastMail } from './mail';

export const uniqueEmail = (prefix: string): string => `${prefix}-${Date.now()}@example.com`;

// Better Auth omezuje počet pokusů o přihlášení na IP adresu (podle X-Forwarded-For).
// Každý test vystupuje jako jiný hráč z jiné adresy, jinak by se pokusy sčítaly napříč testy.
let clientIndex = 0;
export async function useUniqueClientIp(context: BrowserContext): Promise<void> {
  clientIndex++;
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${process.pid % 250}.${clientIndex % 250}.${Date.now() % 250}`,
  });
}

export async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Registrace' }).click();
  await expect(page.getByRole('heading', { name: 'Registrace' })).toBeVisible();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
}

/** Zaregistruje nového hráče, potvrdí e-mail a skončí na herní ploše. */
export async function registerAndEnterGame(page: Page, prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);
  await register(page, email, 'krajina-heslo-1');
  await page.goto(await linkFromLastMail(email, /potvrď svůj e-mail/));
  await expect(page).toHaveURL(/\/game$/);
  return email;
}
