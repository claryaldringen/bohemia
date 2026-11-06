import type { Dialog, DialogKind, DialogRepository, DialogStatus, NewDialog } from '../dialogs';

/** Dialogy v paměti – jedinečný klíč a podmíněné odpovědi jako v databázi. */
export class InMemoryDialogs implements DialogRepository {
  readonly rows: Dialog[] = [];
  private nextId = 1;

  async openOnce(key: string, input: NewDialog): Promise<Dialog | null> {
    await Promise.resolve();
    if (this.rows.some((d) => d.key === key)) return null;
    const dialog: Dialog = {
      ...structuredClone(input),
      id: `dialog-${this.nextId++}`,
      key,
      years: 1,
      status: 'open',
      createdAt: new Date(0),
    };
    this.rows.push(dialog);
    return structuredClone(dialog);
  }

  async openFor(refId: string, kind: DialogKind): Promise<Dialog | null> {
    await Promise.resolve();
    const found = this.rows.find(
      (d) => d.refId === refId && d.kind === kind && d.status === 'open',
    );
    return found ? structuredClone(found) : null;
  }

  async bumpYears(key: string, toYear: number): Promise<number> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.key === key);
    if (!found || found.status !== 'open' || found.year >= toYear) return 0;
    const added = toYear - found.year;
    found.years += added;
    found.year = toYear;
    return added;
  }

  async listOpen(playerId: string): Promise<Dialog[]> {
    await Promise.resolve();
    return structuredClone(this.rows.filter((d) => d.playerId === playerId && d.status === 'open'));
  }

  async byId(id: string): Promise<Dialog | null> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    return found ? structuredClone(found) : null;
  }

  async answer(id: string, expectedStatus: DialogStatus): Promise<boolean> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    if (!found || found.status !== expectedStatus) return false;
    found.status = 'answered';
    return true;
  }

  async dropFor(refId: string): Promise<void> {
    await Promise.resolve();
    for (const d of this.rows) if (d.refId === refId && d.status === 'open') d.status = 'dropped';
  }

  async dropOpenOf(playerId: string): Promise<void> {
    await Promise.resolve();
    for (const d of this.rows)
      if (d.playerId === playerId && d.status === 'open') d.status = 'dropped';
  }
}
