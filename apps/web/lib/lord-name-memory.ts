// Poslední jméno vojvody v prohlížeči (lord.md – Kde se jméno zadává: „Začít znovu panel ukáže
// znovu, předvyplněný posledním jménem“) – sessionStorage panelu, bez nového portu DB (návrh
// Clauda). Úložiště nemusí být dostupné (soukromé okno, zakázané) – pak se nic nepamatuje.

const STORAGE_KEY = 'bohemia:last-lord-name';

/** Zapamatuje jméno vojvody pro příští založení hry; prázdné nic nemění. */
export function rememberLordName(name: string | undefined): void {
  if (name === undefined || name.trim() === '') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, name);
  } catch {
    // úložiště není – jméno se jen nepředvyplní
  }
}

/** Poslední jméno vojvody, nebo prázdný text. */
export function lastLordName(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
