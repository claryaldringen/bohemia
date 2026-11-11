import { freezeSharedRecords } from './domain/village/core/clone';

// Kopie stavu sdílí záznamy seznamů, které se nemění na místě (clone.ts) – v testech se zmrazí,
// takže kdo by je měnil na místě, spadne.
freezeSharedRecords(true);
