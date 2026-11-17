import { expect, type BrowserContext, type Page } from '@playwright/test';
import { linkFromLastMail } from './mail';
import { placeIsolatedPlayer } from './placement';

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

export async function register(
  page: Page,
  email: string,
  password: string,
  language?: string,
): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Registrace' }).click();
  await expect(page.getByRole('heading', { name: 'Registrace' })).toBeVisible();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  if (language) await page.getByLabel('Jazyk').selectOption(language);
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(page.getByText('Zkontroluj e-mail')).toBeVisible();
}

/** Otevře nabídku hry tlačítkem v horní liště (jako F10) a vrátí její panel. */
export async function openGameMenu(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Nabídka' }).click();
  const menu = page.getByRole('dialog', { name: 'Nabídka' });
  await expect(menu).toBeVisible();
  return menu;
}

/** Otevře Nastavení v nabídce hry a vrátí přepínač zvuků krajiny (`aria-checked`). */
export async function openSoundSetting(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const menu = await openGameMenu(page);
  await menu.getByRole('button', { name: 'Nastavení' }).click();
  const toggle = menu.getByRole('switch', { name: 'Zvuky krajiny' });
  await expect(toggle).toBeVisible();
  return toggle;
}

/** Ve vývojovém režimu otevře klikem na datum panel zrychlení času (je-li zavřený). */
export async function openDevTime(page: Page): Promise<void> {
  if (await page.getByTestId('dev-time-panel').isVisible()) return;
  await page.getByTestId('game-date-toggle').click();
  await expect(page.getByTestId('dev-time-panel')).toBeVisible();
}

/** Odhlásí hráče z nabídky hry. */
export async function signOut(page: Page): Promise<void> {
  const menu = await openGameMenu(page);
  await menu.getByRole('button', { name: 'Odhlásit' }).click();
  // první vykreslení scény v headless prohlížeči (softwarová grafika) drží hlavní vlákno ≈ 7 s –
  // přesměrování po odhlášení na něj počká
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
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
  // bez pozvánky odříznutý nováček – testy počítají s hráčem na mapě světa (placement.ts)
  if (await placeIsolatedPlayer(email)) await page.reload();
  return email;
}

/**
 * Počká, až scéna dostaví krajinu a vykreslí první snímek. Bezhlavý Chromium kreslí softwarově
 * a první snímek po `data-scene-ready` zablokuje stránku na několik sekund (měřeno ≈ 5 s pod
 * zátěží) – krok testu s výchozím limitem 5 s by v tu chvíli nestihl ani změnu panelu.
 */
export async function sceneSettled(page: Page): Promise<void> {
  await expect(page.locator('canvas[data-scene-ready="true"]')).toBeAttached({ timeout: 120_000 });
  // dva snímky prohlížeče – druhý přijde až po prvním (pomalém) vykreslení scény
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
