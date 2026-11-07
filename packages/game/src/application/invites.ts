import {
  INVITES,
  isInviteAvailableTo,
  isInviteUnused,
  newInviteCode,
  parseInviteCode,
} from '../domain/world';
import type { HouseRepository } from './houses';

export const INVITE_INVALID = 'Pozvánka neplatí.';
export const INVITE_NEEDS_HOUSE = 'Pozvánky smí vydávat jen hráč s živým rodem.';
export const INVITE_LIMIT = `Nevyužité pozvánky mohou být nejvýš ${INVITES.maxUnused}.`;

/** Kolikrát se zkusí nový kód, když se trefí do už existujícího (31^8 možností – skoro nikdy). */
const ISSUE_ATTEMPTS = 5;

/** Pozvánkový kód. Rezervace patří novému hráči od registrace, využije se při vstupu do hry. */
export interface Invite {
  code: string;
  issuerId: string;
  createdAt: Date;
  validUntil: Date;
  reservedBy: string | null;
  reservedAt: Date | null;
  usedBy: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Port náhody: číslo z [0, 1). Web ho plní z kryptografického zdroje. */
export interface RandomSource {
  random(): number;
}

/** Port repozitáře pozvánek. */
export interface InviteRepository {
  /** Uloží nový kód; null, když kód už existuje (kolize primárního klíče). */
  issue(input: {
    code: string;
    issuerId: string;
    createdAt: Date;
    validUntil: Date;
  }): Promise<Invite | null>;
  find(code: string): Promise<Invite | null>;
  /** Zruší kód vydavatele, který ještě nebyl využitý ani zrušený; true jen při změně. */
  revoke(code: string, issuerId: string, at: Date): Promise<boolean>;
  /** Všechny kódy vydavatele, nejnovější první. */
  listOf(issuerId: string): Promise<Invite[]>;
  /**
   * Atomicky zarezervuje kód uživateli: jen nezrušený, nevyužitý, platný a nerezervovaný jiným
   * (a ne vlastní). Opakovaná rezervace téhož kódu týmž uživatelem je v pořádku.
   */
  reserve(code: string, userId: string, now: Date): Promise<'ok' | 'invalid'>;
  /** Využije uživatelovu rezervaci (jen jednou); vrátí kód, nebo null, když žádná není. */
  consumeReservation(userId: string, now: Date): Promise<Invite | null>;
  /** Všechny využité kódy (podle nich se počítá nástupnictví za pozvaného). */
  listUsed(): Promise<Invite[]>;
}

export interface InviteDeps {
  invites: InviteRepository;
  houses: HouseRepository;
  random: RandomSource;
  now: () => Date;
}

export type IssueInviteResult = { ok: true; invite: Invite } | { ok: false; error: string };

/** Vydá nový kód. Smí jen hráč s živým rodem; nevyužitých kódů je nejvýš `INVITES.maxUnused`. */
export async function issueInvite(deps: InviteDeps, playerId: string): Promise<IssueInviteResult> {
  if (!(await deps.houses.activeOf(playerId))) return { ok: false, error: INVITE_NEEDS_HOUSE };
  const now = deps.now();
  const unused = (await deps.invites.listOf(playerId)).filter((i) => isInviteUnused(i, now));
  if (unused.length >= INVITES.maxUnused) return { ok: false, error: INVITE_LIMIT };
  const validUntil = new Date(now.getTime() + INVITES.validDays * 86_400_000);
  for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt++) {
    const code = newInviteCode(() => deps.random.random());
    const invite = await deps.invites.issue({
      code,
      issuerId: playerId,
      createdAt: now,
      validUntil,
    });
    if (invite) return { ok: true, invite };
  }
  throw new Error('Pozvánku se nepodařilo vydat.');
}

/** Zruší vlastní nevyužitý kód; false, když to nejde (cizí, využitý, už zrušený). */
export async function revokeInvite(
  deps: InviteDeps,
  playerId: string,
  rawCode: string,
): Promise<boolean> {
  const code = parseInviteCode(rawCode);
  return code === null ? false : deps.invites.revoke(code, playerId, deps.now());
}

/** Předběžná kontrola kódu před registrací (nic nemění). */
export async function checkInvite(
  deps: Pick<InviteDeps, 'invites' | 'now'>,
  rawCode: string,
): Promise<boolean> {
  const code = parseInviteCode(rawCode);
  const invite = code === null ? null : await deps.invites.find(code);
  return invite !== null && isInviteAvailableTo(invite, '', deps.now());
}

/** Zarezervuje kód novému hráči; vazalem se pozvaný stane až při vstupu do hry (úloha 1.9). */
export async function reserveInvite(
  deps: Pick<InviteDeps, 'invites' | 'now'>,
  userId: string,
  rawCode: string,
): Promise<'ok' | 'invalid'> {
  const code = parseInviteCode(rawCode);
  return code === null ? 'invalid' : deps.invites.reserve(code, userId, deps.now());
}
