const INVALID_LINK = 'Odkaz je neplatný nebo vypršel – požádej o nový.';

const MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'Nejdřív potvrď e-mail – odkaz najdeš ve schránce.',
  INVALID_EMAIL_OR_PASSWORD: 'Nesprávný e-mail nebo heslo.',
  INVALID_EMAIL: 'Zadej platný e-mail.',
  PASSWORD_TOO_SHORT: 'Heslo musí mít aspoň 8 znaků.',
  PASSWORD_TOO_LONG: 'Heslo může mít nejvýš 128 znaků.',
  INVALID_TOKEN: INVALID_LINK,
  TOKEN_EXPIRED: INVALID_LINK,
};

/** Chyba z Better Auth → česká hláška pro hráče. */
export function authErrorMessage(error: { code?: string; status?: number }): string {
  if (error.status === 429) return 'Příliš mnoho pokusů – zkus to za chvíli.';
  return (error.code && MESSAGES[error.code]) || 'Něco se nepovedlo – zkus to prosím znovu.';
}
