// Slučovač nárazů (docs/code/server-events.md – Rozbočovač; plán 2026-11-15 – Rozhodnutí 5): worker
// uloží víc vsí hráče v jedné dávce, výprava se ukládá každou sekundu – výpočet se nesmí pouštět
// pro každou změnu zvlášť. Úloha začne až po `delayMs`, pro klíč běží nejvýš jedna naráz a volání
// během běhu dají nejvýš jeden další běh (s poslední zadanou úlohou). Čistý modul bez I/O.

/** Slučovač úloh podle klíče. */
export interface Coalescer {
  /** Zařadí úlohu klíče – volání, než úloha začne, ji jen nahradí. */
  run(key: string, task: () => Promise<void>): void;
}

interface Slot {
  task: () => Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  again: boolean;
}

export function createCoalescer(options: {
  delayMs: number;
  onError(error: unknown, key: string): void;
}): Coalescer {
  const slots = new Map<string, Slot>();

  const report = (error: unknown, key: string): void => {
    try {
      options.onError(error, key);
    } catch {
      // chyba hlášení chyb nesmí slučovač zaseknout
    }
  };

  const schedule = (key: string, slot: Slot): void => {
    slot.timer = setTimeout(() => {
      slot.timer = null;
      void execute(key, slot);
    }, options.delayMs);
  };

  const execute = async (key: string, slot: Slot): Promise<void> => {
    slot.running = true;
    slot.again = false;
    try {
      await slot.task();
    } catch (error) {
      report(error, key);
    }
    slot.running = false;
    if (slot.again) {
      slot.again = false;
      schedule(key, slot);
    } else {
      slots.delete(key);
    }
  };

  return {
    run(key, task): void {
      const slot = slots.get(key);
      if (!slot) {
        const fresh: Slot = { task, timer: null, running: false, again: false };
        slots.set(key, fresh);
        schedule(key, fresh);
        return;
      }
      slot.task = task;
      if (slot.running) slot.again = true;
    },
  };
}
