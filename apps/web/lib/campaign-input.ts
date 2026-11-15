import type { CampaignCommand, GroupOrder, LeaderTarget, Pos, SurrenderOrder } from '@bohemia/game';

// Vstup server actions živého vedení (plán 2026-11-03 – Úloha 6.14) – jen tvar; smí-li hráč pokyn
// dát (vlastní živý velitel, známý cíl), ověří use-case `commandCampaign`.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCampaignId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

const isInt = (value: unknown): value is number => Number.isSafeInteger(value);

function pos(value: unknown): Pos | null {
  if (!isRecord(value)) return null;
  const { x, z } = value;
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z)
    ? { x, z }
    : null;
}

function target(value: unknown): LeaderTarget | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'place': {
      const place = isRecord(value.place) ? value.place : null;
      const cell = place && isRecord(place.cell) ? place.cell : null;
      const at = place ? pos(place.pos) : null;
      if (!cell || !isInt(cell.x) || !isInt(cell.y) || !at) return null;
      return { kind: 'place', place: { cell: { x: cell.x, y: cell.y }, pos: at } };
    }
    case 'building':
      return isInt(value.id) ? { kind: 'building', id: value.id } : null;
    case 'fighter':
      return typeof value.id === 'string' && value.id.length <= 64
        ? { kind: 'fighter', id: value.id }
        : null;
    case 'home':
      return { kind: 'home' };
    default:
      return null;
  }
}

const ORDERS: readonly string[] = ['follow-leader', 'attack-all', 'hold-place'];
const CHOICES: readonly string[] = ['kill', 'lead', 'leave'];

/** `{ campaignId, target }` – pokyn veliteli (`commandLeader`), jinak null. */
export function parseLeaderInput(
  value: unknown,
): { campaignId: string; command: CampaignCommand } | null {
  if (!isRecord(value) || !isCampaignId(value.campaignId)) return null;
  const t = target(value.target);
  return t ? { campaignId: value.campaignId, command: { kind: 'lead', target: t } } : null;
}

/** `{ campaignId, group, order, at? }` – rozkaz skupině (`setGroupOrder`), jinak null. */
export function parseGroupOrderInput(
  value: unknown,
): { campaignId: string; command: CampaignCommand } | null {
  if (!isRecord(value) || !isCampaignId(value.campaignId) || !isInt(value.group)) return null;
  if (typeof value.order !== 'string' || !ORDERS.includes(value.order)) return null;
  const at = value.at === undefined ? undefined : pos(value.at);
  if (at === null) return null;
  const command: CampaignCommand = {
    kind: 'order',
    group: value.group,
    order: value.order as GroupOrder,
    ...(at ? { at } : {}),
  };
  return { campaignId: value.campaignId, command };
}

/** `{ campaignId, group, choice }` – volba ke vzdaným (`chooseSurrendered`), jinak null. */
export function parseSurrenderedInput(
  value: unknown,
): { campaignId: string; command: CampaignCommand } | null {
  if (!isRecord(value) || !isCampaignId(value.campaignId) || !isInt(value.group)) return null;
  if (typeof value.choice !== 'string' || !CHOICES.includes(value.choice)) return null;
  return {
    campaignId: value.campaignId,
    command: { kind: 'surrendered', group: value.group, choice: value.choice as SurrenderOrder },
  };
}
