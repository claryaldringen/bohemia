// Dialogy hráče (vassalage.md – Roční dialog 1. 11.): otázky, na které hráč odpovídá, když se mu
// to hodí – roční Odvody, později poplatky, odúmrť, svolání a rozsudek. Dialog drží server, ne
// prohlížeč; odpověď je podmíněná (`answer`), takže ze souběžných odpovědí uspěje jedna.

export type DialogKind = 'levy' | 'trade-send' | 'fee-send' | 'escheat' | 'summons' | 'judgment';

/** `open` – čeká na odpověď, `answered` – hráč odpověděl, `dropped` – zmizel (dohoda skončila). */
export type DialogStatus = 'open' | 'answered' | 'dropped';

export interface Dialog {
  id: string;
  playerId: string;
  kind: DialogKind;
  /** Jedinečný klíč dialogu (u Odvodů `levy:<vazalství>:<rok>`) – dvakrát se neotevře. */
  key: string;
  /** Na co se dialog vztahuje (u Odvodů id vazalství); s koncem vztahu dialog zmizí (`dropFor`). */
  refId: string;
  /** Herní rok, ke kterému dialog patří (u Odvodů rok 1. 11., kdy vznikl, nebo naposledy narostl). */
  year: number;
  /** Za kolik let dialog čeká (Odvody bez odpovědi: každý další 1. 11. o rok víc). */
  years: number;
  body: Record<string, unknown>;
  status: DialogStatus;
  createdAt: Date;
}

export interface NewDialog {
  playerId: string;
  kind: DialogKind;
  refId: string;
  year: number;
  body: Record<string, unknown>;
}

/** Port repozitáře dialogů. */
export interface DialogRepository {
  /** Otevře dialog s klíčem `key`; existuje-li už (jakýkoli stav), vrátí null a nic nezdvojí. */
  openOnce(key: string, input: NewDialog): Promise<Dialog | null>;
  /** Otevřený dialog druhu `kind` k `refId`, nebo null. */
  openFor(refId: string, kind: DialogKind): Promise<Dialog | null>;
  /**
   * Čekajícímu dialogu `key` posune rok na `toYear` a přičte rozdíl k `years`; podmíněně (jen
   * otevřený a `year < toYear`), takže opakování nic nezdvojí. Vrací přičtený počet let (0 – nic).
   */
  bumpYears(key: string, toYear: number): Promise<number>;
  /** Otevřené dialogy hráče, nejstarší první. */
  listOpen(playerId: string): Promise<Dialog[]>;
  byId(id: string): Promise<Dialog | null>;
  /** Podmíněně označí dialog za zodpovězený: jen když má stav `expectedStatus`; true při změně. */
  answer(id: string, expectedStatus: DialogStatus): Promise<boolean>;
  /** Otevřené dialogy k `refId` zmizí (stav `dropped`). */
  dropFor(refId: string): Promise<void>;
}
