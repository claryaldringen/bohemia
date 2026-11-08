import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  contestsFortification,
  startSectionReroute,
  villageRoadWalk,
  type WallKind,
} from '../domain/village';
import type { CampaignRepository } from './campaigns';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface RerouteFortificationSectionInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl (`FortSegment.index`) ve zbořeném úseku – úsek mezi branami dohledá server. */
  segment: number;
  /** Body nové trasy od brány na začátku úseku po bránu na jeho konci (bez konců). */
  points: readonly (readonly [number, number])[];
  /** Hradba nového úseku. */
  target: WallKind;
}

/** Jak daleko za dnešek hledat nedoručené události schránky (dny) – zápis padne nejvýš na zítřek. */
const PENDING_HORIZON_DAYS = 366;

/**
 * Bojuje se u vsi podle světa mimo její stav (návrh Clauda – nový tvar přečísluje díly): ve
 * schránce čeká nedoručená událost boje (`contestsFortification` – průlom s čísly dílů, den
 * vojska na mapě, výsledek nájezdu), nebo proti vsi běží tažení (aktivní i s nedoručenými
 * událostmi – `CampaignRepository.active`).
 */
async function villageContested(
  deps: {
    villages: VillageRepository;
    campaigns?: Pick<CampaignRepository, 'active' | 'checkpoint'>;
  },
  villageId: string,
  today: number,
): Promise<boolean> {
  const later = await deps.villages.inbox.pending(villageId, today, today + PENDING_HORIZON_DAYS);
  if (later.some((e) => contestsFortification(e.body))) return true;
  if (!deps.campaigns) return false;
  for (const id of await deps.campaigns.active()) {
    const point = await deps.campaigns.checkpoint(id);
    if (point?.state.target.villageId === villageId) return true;
  }
  return false;
}

/**
 * Hráč postaví zbořený úsek opevnění mezi branami jinudy (demolition.md – Rozhodnutí): nová trasa
 * z bodů, konce drží brány; stavba za cenu nové hradby podle délky nového úseku. Počká, dokud se
 * u vsi bojuje (`villageContested`, cizí vojsko dnes na mapě vsi – `FORT_UNDER_ATTACK`).
 */
export async function rerouteFortificationSection(
  deps: {
    villages: VillageRepository;
    /** Tažení proti vsi (chybí – jen schránka a stav vsi). */
    campaigns?: Pick<CampaignRepository, 'active' | 'checkpoint'>;
  },
  input: RerouteFortificationSectionInput,
): Promise<VillageResult> {
  const contested = await villageContested(deps, input.villageId, input.today);
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startSectionReroute(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        {
          fortificationId: input.fortificationId,
          segment: input.segment,
          points: input.points,
          target: input.target,
          ...(contested ? { contested } : {}),
        },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
