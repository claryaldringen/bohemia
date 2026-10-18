// Kalibrace běží na pozadí (Martin: „aby běžela hlavně, když neběží nic jiného“): nejnižší
// priorita procesu (nice 19) – volná jádra využije, ostatním programům ustoupí. Na macOS jde
// navíc QoS „background“ (taskpolicy -b, volba --eco): jen úsporná jádra a I/O s nejnižší
// prioritou – na M1 Pro (2 úsporná jádra) je ale ≈ 6× pomalejší i na nevytíženém stroji, proto
// není výchozí. Worker vlákna jsou ve stejném procesu; na Linuxu je priorita po vláknech, proto
// ji worker nastaví i sám sobě (`lowerThreadPriority`).
import { spawnSync } from 'node:child_process';
import { availableParallelism, constants, setPriority } from 'node:os';

/** Sníží prioritu procesu (s `eco` i QoS background); vrací popis toho, co se podařilo. */
export function lowerProcessPriority(eco: boolean): string {
  const applied: string[] = [];
  try {
    setPriority(constants.priority.PRIORITY_LOW);
    applied.push('nice 19');
  } catch {
    // bez práv nebo na systému bez priorit – poběží s běžnou prioritou
  }
  if (eco && process.platform === 'darwin') {
    const result = spawnSync('taskpolicy', ['-b', '-p', String(process.pid)], { stdio: 'ignore' });
    if (result.status === 0) applied.push('QoS background');
  }
  return applied.length > 0 ? applied.join(' + ') : 'běžná priorita';
}

/** Nejnižší priorita vlákna (Linux plánuje vlákna zvlášť; na macOS už platí pro celý proces). */
export function lowerThreadPriority(): void {
  try {
    setPriority(constants.priority.PRIORITY_LOW);
  } catch {
    // stejně jako u procesu
  }
}

/** Výchozí počet worker vláken – polovina jader, aby zbylo na ostatní práci. */
export function defaultWorkers(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}
