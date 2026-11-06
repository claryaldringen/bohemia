import type { Loan, LoanRepository, NewLoan } from '../loans';
import { scheduleValue } from '../../domain/vassalage';

/** Repozitář půjček v paměti (sdílený s `InMemoryNegotiations`, jako tabulka v databázi). */
export class InMemoryLoans implements LoanRepository {
  readonly loans: Loan[] = [];
  private nextId = 1;

  async create(input: NewLoan): Promise<Loan> {
    const existing = this.loans.find((l) => l.negotiationId === input.negotiationId);
    if (existing) return existing;
    const loan: Loan = {
      ...input,
      id: `loan-${this.nextId++}`,
      paidKg: 0,
      breaches: 0,
      status: 'active',
      settledAt: null,
    };
    this.loans.push(loan);
    return loan;
  }

  async cancelOfNegotiation(negotiationId: string, at: Date): Promise<boolean> {
    const loan = this.loans.find((l) => l.negotiationId === negotiationId && l.status === 'active');
    if (!loan) return false;
    loan.status = 'cancelled';
    loan.settledAt = at;
    return true;
  }

  async byId(id: string): Promise<Loan | null> {
    return this.loans.find((l) => l.id === id) ?? null;
  }

  async allActive(): Promise<Loan[]> {
    return this.loans.filter((l) => l.status === 'active');
  }

  async activeOfDebtor(houseId: string): Promise<Loan[]> {
    return this.loans.filter((l) => l.status === 'active' && l.debtorHouseId === houseId);
  }

  async pay(id: string, valueKg: number, at: Date): Promise<Loan | null> {
    const loan = this.loans.find((l) => l.id === id && l.status === 'active');
    if (!loan) return null;
    loan.paidKg += valueKg;
    if (loan.paidKg + 1e-6 >= scheduleValue(loan.schedule)) {
      loan.status = 'repaid';
      loan.settledAt = at;
    }
    return loan;
  }

  async addBreach(id: string): Promise<boolean> {
    const loan = this.loans.find((l) => l.id === id && l.status === 'active');
    if (!loan) return false;
    loan.breaches++;
    return true;
  }

  async cancelOfDebtor(houseId: string, at: Date): Promise<string[]> {
    const out: string[] = [];
    for (const loan of this.loans) {
      if (loan.status !== 'active' || loan.debtorHouseId !== houseId) continue;
      loan.status = 'cancelled';
      loan.settledAt = at;
      out.push(loan.id);
    }
    return out;
  }

  async moveCredits(
    fromHouseId: string,
    debtorHouseId: string,
    toHouseId: string,
  ): Promise<string[]> {
    await Promise.resolve();
    const out: string[] = [];
    for (const loan of this.loans) {
      if (loan.status !== 'active' || loan.creditorHouseId !== fromHouseId) continue;
      if (loan.debtorHouseId !== debtorHouseId) continue;
      loan.creditorHouseId = toHouseId;
      out.push(loan.id);
    }
    return out;
  }
}
