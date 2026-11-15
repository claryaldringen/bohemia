import type { ComponentProps, RefObject } from 'react';
import type { Direction8 } from '@bohemia/game';
import {
  abandonFieldParts,
  abandonStructure,
  addFortificationRampart,
  baptizeLord,
  buildTrail,
  buildWagonRoad,
  cancelConstruction,
  choosePlayerDeparture,
  decidePrisonerAction,
  declareHunt,
  demolishFortificationSection,
  demolishStructure,
  ennobleVillager,
  fillFortificationMoat,
  inviteLodge,
  inviteMaster,
  leaveVillage,
  orderStoneQuarrying,
  plantRoadApples,
  renameVillage,
  restoreStructure,
  sendExpedition,
  setDefenseStance,
  setSteward,
  upgradeFortification,
  upgradeFortificationGate,
  abandonFortificationGate,
  demolishFortificationGate,
  upgradeRoad,
} from '@/app/game/actions';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { keepShownVillage } from '@/lib/village-list';
import type { VillageView } from '@/lib/village-view';
import type { NoticeLine } from '../hud/NoticeLines';
import type { SelectionPanel } from '../hud/SelectionPanel';
import {
  CONNECTION_FAILED,
  isVillageView,
  type ActionResult,
  type VillageData,
} from './village-data';

/** Opustit, zbourat a vrátit stavbu (demolition.md) – server action podle tlačítka v panelu. */
const STRUCTURE_USE_ACTIONS = {
  abandon: abandonStructure,
  demolish: demolishStructure,
  restore: restoreStructure,
} as const;

/** Obsluhy panelu výběru, které posílají akce nad zobrazenou vsí na server. */
export type SelectionCommands = Required<
  Pick<
    ComponentProps<typeof SelectionPanel>,
    | 'onSetSteward'
    | 'onLeave'
    | 'onLeaveSon'
    | 'onBaptize'
    | 'onInviteLodge'
    | 'onInviteMaster'
    | 'onOrderQuarrying'
    | 'onAbandonPart'
    | 'onStructureUse'
    | 'onCancelConstruction'
    | 'onFortAction'
    | 'onFortDemolish'
    | 'onUpgradeRoad'
    | 'onPlantRoadApples'
    | 'onBuildWagonRoad'
    | 'onBuildTrail'
    | 'onDeclareHunt'
    | 'onDecidePrisoner'
    | 'onSetStance'
    | 'onSendExpedition'
  >
>;

export interface VillageCommands {
  /** Přejmenuje zobrazenou ves (lišta). */
  rename: (name: string) => Promise<string | null>;
  /** Zapne / vypne správce vsi (steward.md) – pohled se po odpovědi obnoví. */
  toggleSteward: (villageId: string, on: boolean) => Promise<string | null>;
  /** Hráč povýší vesničana pro ves bez vojvody (server ověří právo, rok a cíl). */
  ennoble: (personId: number, targetVillageId: string) => Promise<string | null>;
  /** Hráč v kůži mladšího syna zvolil směr odchodu po pohřbu (seniorate.md, bod 4). */
  choosePlayerDeparture: (direction: Direction8, sonName?: string) => Promise<string | null>;
  /** Obsluhy panelu výběru. */
  selection: SelectionCommands;
}

/**
 * Akce nad zobrazenou vsí (server actions přes frontu `runAction` / `runBuildAction` z
 * `useVillageSync`): id vsi se čte z `viewRef` až při volání, chyba se ohlásí řádkem nahoře.
 * Obyčejná funkce bez hooků – obsluhy vznikají při každém vykreslení jako dřív přímo ve
 * `VillageGame`.
 */
export function villageCommands({
  scene,
  viewRef,
  runAction,
  runBuildAction,
  pushNotice,
  setSelected,
}: {
  scene: LandscapeScene | null;
  viewRef: RefObject<VillageView | null>;
  runAction: (action: () => Promise<VillageData>) => Promise<string | null>;
  runBuildAction: (action: () => Promise<ActionResult>) => Promise<void>;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  setSelected: (target: VillageTarget | null) => void;
}): VillageCommands {
  /** Chyba akce se ukáže řádkem nahoře; vrátí ji dál (panel ji ukáže u tlačítka). */
  const reported = (failure: string | null): string | null => {
    if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
    return failure;
  };

  /** Akce stavby nad zobrazenou vsí; bez vsi nic. */
  const build = (action: (villageId: string) => Promise<ActionResult>): Promise<void> => {
    const villageId = viewRef.current?.id;
    return villageId ? runBuildAction(() => action(villageId)) : Promise.resolve();
  };

  const rename = (name: string): Promise<string | null> => {
    const villageId = viewRef.current?.id;
    return villageId
      ? runAction(() => renameVillage({ villageId, name }))
      : Promise.resolve(CONNECTION_FAILED);
  };

  const toggleSteward = (villageId: string, on: boolean): Promise<string | null> =>
    runAction(async () => {
      const result = await setSteward({ villageId, on });
      // správce jiné vsi ze seznamu: pohled zůstane na zobrazené vsi, změní se jen seznam vsí
      if (isVillageView(result)) return keepShownVillage(viewRef.current, result);
      return result;
    }).then(reported);

  /**
   * Odejít do nové vsi (migration.md – fáze 3 a 4): domácnosti obydlí `householdIds` nebo syn
   * vojvody vyrazí na novou mapu ve směru `direction` (ve vsi zůstane řádek cesty). Jedna ves,
   * jedna mapa – na téže mapě nová ves nevznikne.
   */
  const departFromVillage = (
    direction: Direction8,
    who: { dwellingIds: number[] } | { sonId: number },
  ): void => {
    const villageId = viewRef.current?.id;
    if (!scene || !villageId) return;
    if ('dwellingIds' in who && who.dwellingIds.length === 0) return;
    const leaving = 'sonId' in who ? 'Syn vojvody vyrazil' : 'Lidé vyrazili';
    setSelected(null);
    void runAction(() =>
      leaveVillage({ villageId, ...who, destination: { kind: 'map', direction } }),
    ).then((failure) => {
      pushNotice(
        failure === null
          ? {
              kind: 'households-left',
              tone: 'info',
              text: `${leaving} na ${DIRECTION_NAMES[direction].name}`,
            }
          : { kind: 'error', tone: 'error', text: failure },
      );
    });
  };

  const choosePlayerDepartureFromPanel = async (
    direction: Direction8,
    sonName?: string,
  ): Promise<string | null> => {
    const villageId = viewRef.current?.id;
    if (!scene || !villageId) return null;
    setSelected(null);
    const failure = await runAction(() =>
      choosePlayerDeparture({
        villageId,
        direction,
        ...(sonName === undefined ? {} : { sonName }),
      }),
    );
    pushNotice(
      failure === null
        ? {
            kind: 'households-left',
            tone: 'info',
            text: `Výprava vyrazila na ${DIRECTION_NAMES[direction].name}`,
          }
        : { kind: 'error', tone: 'error', text: failure },
    );
    return failure;
  };

  const ennoble = (personId: number, targetVillageId: string): Promise<string | null> => {
    const villageId = viewRef.current?.id;
    if (!villageId) return Promise.resolve(CONNECTION_FAILED);
    return runAction(() => ennobleVillager({ villageId, personId, targetVillageId }));
  };

  const selection: SelectionCommands = {
    onSetSteward: (on) => {
      const villageId = viewRef.current?.id;
      return villageId ? toggleSteward(villageId, on) : Promise.resolve(CONNECTION_FAILED);
    },
    // odchod domácností obydlí `householdIds`
    onLeave: (direction, householdIds) =>
      departFromVillage(direction, { dwellingIds: [...householdIds] }),
    // odchod s poměrnou částí vsi pod vedením syna vojvody (lord.md – Dělení vsi)
    onLeaveSon: (direction, sonId) => departFromVillage(direction, { sonId }),
    // křest vojvody (server ověří právo, znalost a že vojvoda žije tady)
    onBaptize: () => {
      const villageId = viewRef.current?.id;
      if (!villageId) return Promise.resolve(CONNECTION_FAILED);
      return runAction(() => baptizeLord({ villageId }));
    },
    // pozvání huti a chybějícího mistra (server ověří právo, pokřtěný rod a obor)
    onInviteLodge: (circle) => {
      const villageId = viewRef.current?.id;
      if (!villageId) return Promise.resolve(CONNECTION_FAILED);
      return runAction(() => inviteLodge({ villageId, circle }));
    },
    onInviteMaster: (craft) => {
      const villageId = viewRef.current?.id;
      if (!villageId) return Promise.resolve(CONNECTION_FAILED);
      return runAction(() => inviteMaster({ villageId, craft }));
    },
    onOrderQuarrying: (outcropId, m3) =>
      build((villageId) => orderStoneQuarrying({ villageId, outcropId, m3 })),
    onAbandonPart: (partId, abandon) =>
      build((villageId) => abandonFieldParts({ villageId, partIds: [partId], abandon })),
    onStructureUse: (action, structure, id) => {
      const run = STRUCTURE_USE_ACTIONS[action];
      return build((villageId) => run({ villageId, structure, id }));
    },
    onCancelConstruction: (constructionId) =>
      build((villageId) => cancelConstruction({ villageId, constructionId })),
    onFortAction: (fortificationId, segment, action) => {
      const villageId = viewRef.current?.id;
      if (!villageId) return Promise.resolve();
      const at = { villageId, fortificationId };
      switch (action.kind) {
        case 'upgrade':
          return runBuildAction(() =>
            upgradeFortification({ ...at, target: action.target, segment }),
          );
        case 'rampart':
          return runBuildAction(() => addFortificationRampart({ ...at, segment }));
        case 'moat':
          return segment === null
            ? Promise.resolve()
            : runBuildAction(() => fillFortificationMoat({ ...at, segment }));
        case 'gate':
          return segment === null
            ? Promise.resolve()
            : runBuildAction(() =>
                upgradeFortificationGate({ ...at, segment, level: action.level }),
              );
        case 'gate-abandon':
          return segment === null
            ? Promise.resolve()
            : runBuildAction(() =>
                abandonFortificationGate({ ...at, segment, abandoned: action.abandoned }),
              );
        case 'gate-demolish':
          return segment === null
            ? Promise.resolve()
            : runBuildAction(() => demolishFortificationGate({ ...at, segment }));
      }
    },
    onFortDemolish: (fortificationId, segment) =>
      build((villageId) => demolishFortificationSection({ villageId, fortificationId, segment })),
    onUpgradeRoad: (roadId, upgrade) =>
      build((villageId) => upgradeRoad({ villageId, roadId, upgrade })),
    onPlantRoadApples: (roadId) => build((villageId) => plantRoadApples({ villageId, roadId })),
    onBuildWagonRoad: (roadId) => build((villageId) => buildWagonRoad({ villageId, roadId })),
    onBuildTrail: (direction) => build((villageId) => buildTrail({ villageId, direction })),
    onDeclareHunt: () => {
      const villageId = viewRef.current?.id;
      // důvod odepření se ukáže řádkem nahoře (u kurzoru) a tlačítko ho má v popisku
      return villageId
        ? runAction(() => declareHunt({ villageId })).then(reported)
        : Promise.resolve(null);
    },
    onDecidePrisoner: (prisonerId, action) =>
      decidePrisonerAction({ prisonerId, action }).then((result) => {
        if ('error' in result) {
          pushNotice({ kind: 'error', tone: 'error', text: result.error });
          return result.error;
        }
        return null;
      }),
    onSetStance: (stance) => {
      const villageId = viewRef.current?.id;
      return villageId
        ? runAction(() => setDefenseStance({ villageId, stance })).then(reported)
        : Promise.resolve(null);
    },
    onSendExpedition: (direction, give, get, people) => {
      const villageId = viewRef.current?.id;
      // chyba zůstane v panelu obchodu (vrácený důvod) i jako krátký řádek nahoře
      return villageId
        ? runAction(() =>
            sendExpedition({
              villageId,
              direction,
              give,
              get,
              givePeople: people.give,
              getPeople: people.get,
            }),
          ).then(reported)
        : Promise.resolve(null);
    },
  };

  return {
    rename,
    toggleSteward,
    ennoble,
    choosePlayerDeparture: choosePlayerDepartureFromPanel,
    selection,
  };
}
