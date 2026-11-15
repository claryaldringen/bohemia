import type { DbChange } from '@bohemia/db';
import type { GridCell } from '@bohemia/game';
import type { ServerEvents } from './protocol';

// Komu jde změna z databáze (docs/code/server-events.md – Rozbočovač; plán 2026-11-15 – Rozhodnutí
// 4). Čistá funkce nad rozsahy spojení: signály (prohlížeč si dočte sám) jdou rovnou, stav (výpravy,
// tažení, válka) se počítá jednou na hráče a předmět – výpočty bez opakování podle `computeKey`.

/** Rozsah spojení ověřený při připojení (`resolveConnectionScope`). */
export interface ConnectionScope {
  playerId: string;
  /** Zobrazená ves (vlastní, nebo spravovaná) – null: panel bez vsi. */
  villageId: string | null;
  /** Sídlo zobrazené vsi. */
  settlementId: string | null;
  /** Políčko světa zobrazené vsi; odříznuté sídlo null. */
  cell: GridCell | null;
  /** Otevřený pohled na tažení hráče. */
  campaignId: string | null;
  /** Cizí mapa ve scéně (tažení a políčko). */
  scene: { campaignId: string; cell: GridCell } | null;
}

/** Výpočet stavu pro hráče a předmět – počítá ho rozbočovač (počítadla v `pushers.ts`). */
export type ComputeTask =
  | { what: 'journeys'; playerId: string }
  | { what: 'visitors'; playerId: string; villageId: string }
  | { what: 'campaign'; playerId: string; campaignId: string }
  | { what: 'war-home'; playerId: string; settlementId: string }
  | { what: 'war-scene'; playerId: string; campaignId: string; cell: GridCell };

/** Signál – událost, po které si prohlížeč stav dočte sám. */
export type SignalName = 'village' | 'notices' | 'alarm' | 'skip';

/** Signál pro jedno spojení. */
export interface RoutedSignal {
  sinkId: number;
  name: SignalName;
  data: unknown;
}

/** Klíč výpočtu – hráč a předmět; stejný klíč = týž výpočet (slučovač, paměť klíčů). */
export function computeKey(task: ComputeTask): string {
  switch (task.what) {
    case 'journeys':
      return `journeys:${task.playerId}`;
    case 'visitors':
      return `visitors:${task.playerId}:${task.villageId}`;
    case 'campaign':
      return `campaign:${task.playerId}:${task.campaignId}`;
    case 'war-home':
      return `war-home:${task.playerId}:${task.settlementId}`;
    case 'war-scene':
      return `war-scene:${task.playerId}:${task.campaignId}@${task.cell.x},${task.cell.y}`;
  }
}

function sameCell(a: GridCell, b: GridCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function hasCell(cells: readonly (readonly [number, number])[], cell: GridCell): boolean {
  return cells.some(([x, y]) => x === cell.x && y === cell.y);
}

function sameOptionalCell(a: GridCell | null, b: GridCell | null): boolean {
  return a === null || b === null ? a === b : sameCell(a, b);
}

/**
 * Týž rozsah – přezkoušení práv (stream po `SESSION_RECHECK_MS`): jiný (užší, posunutý) rozsah
 * spojení zavře, prohlížeč se připojí znovu s čerstvým.
 */
export function sameScope(a: ConnectionScope, b: ConnectionScope): boolean {
  return (
    a.playerId === b.playerId &&
    a.villageId === b.villageId &&
    a.settlementId === b.settlementId &&
    sameOptionalCell(a.cell, b.cell) &&
    a.campaignId === b.campaignId &&
    (a.scene === null || b.scene === null
      ? a.scene === b.scene
      : a.scene.campaignId === b.scene.campaignId && sameCell(a.scene.cell, b.scene.cell))
  );
}

/** Dostane spojení výsledek výpočtu? Hráč úlohy a týž předmět v rozsahu. */
export function scopeWantsTask(scope: ConnectionScope, task: ComputeTask): boolean {
  if (scope.playerId !== task.playerId) return false;
  switch (task.what) {
    case 'journeys':
      return true;
    case 'visitors':
      return scope.villageId === task.villageId;
    case 'campaign':
      return scope.campaignId === task.campaignId;
    case 'war-home':
      return scope.settlementId === task.settlementId;
    case 'war-scene':
      return (
        scope.scene !== null &&
        scope.scene.campaignId === task.campaignId &&
        sameCell(scope.scene.cell, task.cell)
      );
  }
}

/**
 * Stav rozsahu, který spojení dostane hned při připojení a po `resync` (revize Úlohy 5): válka na
 * vlastní mapě (`war-home`), na cizí mapě (`war-scene`) a otevřené tažení (`campaign`). První
 * výsledek spojení jde vždy – kdyby šel až s první směrovanou změnou, osamělé `war: null` by
 * prozradilo, že se políčka vsi něčeho dotklo (mlha války); dotaz prohlížeče při otevření navíc
 * běží dřív, než je spojení v rozbočovači, a změnu mezi tím by nikdo neposlal. Výpravy a hosté ne.
 */
export function scopeTasks(scope: ConnectionScope): ComputeTask[] {
  const { playerId } = scope;
  const tasks: ComputeTask[] = [];
  if (scope.settlementId !== null) {
    tasks.push({ what: 'war-home', playerId, settlementId: scope.settlementId });
  }
  if (scope.scene !== null) {
    const { campaignId, cell } = scope.scene;
    tasks.push({ what: 'war-scene', playerId, campaignId, cell });
  }
  if (scope.campaignId !== null) {
    tasks.push({ what: 'campaign', playerId, campaignId: scope.campaignId });
  }
  return tasks;
}

/**
 * Signály a výpočty pro změnu (Rozhodnutí 4):
 * - `v` a `s` – `village` hráči `p` (`op`) a spojením se zobrazenou vsí `id`;
 * - `n` – `notices`, `x` – `skip` hráči `p`;
 * - `j` – výpočet `journeys` připojenému vlastníkovi, `visitors` spojením s políčkem v `c`;
 * - `c` – `campaign` spojením s tažením, `war-scene` spojením s jeho cizí mapou, `war-home`
 *   spojením s políčkem v `c` nebo vsí v `a`, signál `alarm` spojením se vsí v `a`;
 * - `big` (náklad se nevešel do NOTIFY) – `c` a `a` platí pro všechna spojení s políčkem / vsí.
 */
export function routeChange(
  change: DbChange,
  sinks: Iterable<{ id: number; scope: ConnectionScope }>,
): { signals: RoutedSignal[]; computes: ComputeTask[] } {
  const list = Array.from(sinks);
  const signals: RoutedSignal[] = [];
  const computes = new Map<string, ComputeTask>();
  const signal = (sinkId: number, name: SignalName, data: unknown): void => {
    signals.push({ sinkId, name, data });
  };
  const compute = (task: ComputeTask): void => {
    const key = computeKey(task);
    if (!computes.has(key)) computes.set(key, task);
  };
  switch (change.k) {
    case 'v': {
      const data: ServerEvents['village'] = { villageId: change.id, version: change.ver };
      for (const { id, scope } of list) {
        if (scope.playerId === change.p || scope.villageId === change.id)
          signal(id, 'village', data);
      }
      break;
    }
    case 's': {
      const data: ServerEvents['village'] = { villageId: null, version: null };
      for (const { id, scope } of list) {
        if (scope.playerId === change.p || scope.playerId === change.op)
          signal(id, 'village', data);
      }
      break;
    }
    case 'n': {
      const data: ServerEvents['notices'] = {};
      for (const { id, scope } of list)
        if (scope.playerId === change.p) signal(id, 'notices', data);
      break;
    }
    case 'x': {
      const data: ServerEvents['skip'] = { progress: change.progress };
      for (const { id, scope } of list) if (scope.playerId === change.p) signal(id, 'skip', data);
      break;
    }
    case 'j': {
      if (list.some(({ scope }) => scope.playerId === change.p)) {
        compute({ what: 'journeys', playerId: change.p });
      }
      for (const { scope } of list) {
        if (scope.villageId === null || scope.cell === null) continue;
        if (change.big || hasCell(change.c, scope.cell)) {
          compute({ what: 'visitors', playerId: scope.playerId, villageId: scope.villageId });
        }
      }
      break;
    }
    case 'c': {
      for (const { id, scope } of list) {
        const { playerId } = scope;
        if (scope.campaignId === change.id) {
          compute({ what: 'campaign', playerId, campaignId: change.id });
        }
        if (scope.scene !== null && scope.scene.campaignId === change.id) {
          compute({ what: 'war-scene', playerId, campaignId: change.id, cell: scope.scene.cell });
        }
        const cellHit = scope.cell !== null && (change.big || hasCell(change.c, scope.cell));
        const alarmed =
          scope.villageId !== null && (change.big || change.a.includes(scope.villageId));
        if (scope.settlementId !== null && (cellHit || alarmed)) {
          compute({ what: 'war-home', playerId, settlementId: scope.settlementId });
        }
        if (alarmed && scope.villageId !== null) {
          const data: ServerEvents['alarm'] = { villageId: scope.villageId };
          signal(id, 'alarm', data);
        }
      }
      break;
    }
  }
  return { signals, computes: [...computes.values()] };
}
