import type { CampaignPlan, PersonRef } from '@bohemia/game';

// Vstup server actions panelu Vojsko – jen tvar, pravidla ověří use-case (`planCampaign`).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

function ids(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  return value.every((v) => Number.isInteger(v) && (v as number) >= 0) ? (value as number[]) : null;
}

function ref(value: unknown): PersonRef | null {
  if (!isRecord(value) || !isId(value.villageId)) return null;
  const { personId } = value;
  if (!Number.isInteger(personId) || (personId as number) < 0) return null;
  return { villageId: value.villageId, personId: personId as number };
}

/** `{ villageId, targetVillageId }` – ves pro panel a vybraný cíl (nebo null), jinak null. */
export function parseArmyPanelInput(
  value: unknown,
): { villageId: string; targetVillageId: string | null } | null {
  if (!isRecord(value) || !isId(value.villageId)) return null;
  const target = value.targetVillageId ?? null;
  if (target !== null && !isId(target)) return null;
  return { villageId: value.villageId, targetVillageId: target };
}

/** Plán tažení `{ villageId, plan }` (`villageId` = shromaždiště), jinak null. */
export function parseCampaignPlanInput(value: unknown): { plan: CampaignPlan } | null {
  if (!isRecord(value) || !isRecord(value.plan)) return null;
  const p = value.plan;
  const commander = ref(p.commander);
  const deputy = p.deputy === null || p.deputy === undefined ? null : ref(p.deputy);
  if (!commander || (p.deputy != null && !deputy)) return null;
  if (!Array.isArray(p.villages) || p.villages.length === 0 || p.villages.length > 50) return null;
  const villages: CampaignPlan['villages'] = [];
  for (const entry of p.villages as unknown[]) {
    if (!isRecord(entry) || !isId(entry.villageId)) return null;
    const lineMen = ids(entry.lineMen);
    const villagers = ids(entry.villagers);
    const forced = ids(entry.forced);
    if (!lineMen || !villagers || !forced) return null;
    villages.push({ villageId: entry.villageId, lineMen, villagers, forced });
  }
  if (!isId(p.assemblyVillageId) || !isId(p.targetVillageId)) return null;
  if (p.groups !== 'together' && p.groups !== 'by-village') return null;
  if (p.surrendered !== 'kill' && p.surrendered !== 'lead' && p.surrendered !== 'leave') {
    return null;
  }
  if (typeof p.food !== 'number' || !Number.isFinite(p.food) || p.food < 0) return null;
  return {
    plan: {
      commander,
      deputy,
      villages,
      assemblyVillageId: p.assemblyVillageId,
      targetVillageId: p.targetVillageId,
      groups: p.groups,
      surrendered: p.surrendered,
      food: Math.floor(p.food),
    },
  };
}
