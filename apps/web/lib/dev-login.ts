// Vývojové účty (npm run db:seed-dev) mají e-mail v doméně, která nikdy nedoručuje poštu.
export const DEV_EMAIL_DOMAIN = 'bohemia.test';

/** Ve vývoji jde přihlásit i samotným jménem – doplní se k němu vývojová doména. */
export const DEV_LOGIN_BY_NAME = process.env.NODE_ENV !== 'production';

export function loginEmail(input: string, byName: boolean = DEV_LOGIN_BY_NAME): string {
  const value = input.trim();
  return byName && value !== '' && !value.includes('@') ? `${value}@${DEV_EMAIL_DOMAIN}` : value;
}
