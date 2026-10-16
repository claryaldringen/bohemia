import { describe, it, expect } from 'vitest';
import { authErrorMessage } from '../auth-errors';

describe('authErrorMessage', () => {
  it.each([
    [
      { code: 'EMAIL_NOT_VERIFIED', status: 403 },
      'Nejdřív potvrď e-mail – odkaz najdeš ve schránce.',
    ],
    [{ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }, 'Nesprávný e-mail nebo heslo.'],
    [{ code: 'INVALID_EMAIL', status: 400 }, 'Zadej platný e-mail.'],
    [{ code: 'PASSWORD_TOO_SHORT', status: 400 }, 'Heslo musí mít aspoň 8 znaků.'],
    [{ code: 'PASSWORD_TOO_LONG', status: 400 }, 'Heslo může mít nejvýš 128 znaků.'],
    [{ code: 'INVALID_TOKEN', status: 400 }, 'Odkaz je neplatný nebo vypršel – požádej o nový.'],
    [{ code: 'TOKEN_EXPIRED', status: 400 }, 'Odkaz je neplatný nebo vypršel – požádej o nový.'],
  ])('%o → česká hláška', (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });

  it('příliš mnoho pokusů pozná podle stavu 429', () => {
    expect(authErrorMessage({ status: 429 })).toBe('Příliš mnoho pokusů – zkus to za chvíli.');
  });

  it('neznámou chybu nepřekládá doslova, ale obecnou hláškou', () => {
    expect(authErrorMessage({ code: 'FAILED_TO_CREATE_USER', status: 500 })).toBe(
      'Něco se nepovedlo – zkus to prosím znovu.',
    );
    expect(authErrorMessage({})).toBe('Něco se nepovedlo – zkus to prosím znovu.');
  });
});
