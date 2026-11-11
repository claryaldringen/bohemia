'use client';

import type { ReactElement, RefObject } from 'react';
import { dateOfDayIndex } from '@bohemia/game';
import {
  announceWarPassage,
  answerComplaintAction,
  answerLevy,
  answerNegotiation,
  answerPassage,
  answerSummons,
  blockHouse,
  consentEscheat,
  declareWarOnHouse,
  dismissSteward,
  fileComplaintAction,
  houseSpare,
  judgeDisputeAction,
  openNegotiation,
  proposeEscheat,
  recallProtection,
  renounceVassalage,
  requestProtection,
  sendProtection,
  startFreeAction,
  summonVassals,
  unblockHouse,
} from '@/app/game/actions';
import type { ChronicleControl } from '@/hooks/use-chronicle';
import type { NoticesControl } from '@/hooks/use-notices';
import type { VillageListItem } from '@/lib/village-list';
import type { VillageView } from '@/lib/village-view';
import { ChroniclePanel } from '../hud/ChroniclePanel';
import { EscheatDialog } from '../hud/EscheatDialog';
import { GameMenu } from '../hud/GameMenu';
import { HousePanel } from '../hud/HousePanel';
import { LevyDialog } from '../hud/LevyDialog';
import { NoticesPanel } from '../hud/NoticesPanel';
import { WarPanel } from '../hud/WarPanel';
import type { House } from './use-house';
import type { Panels } from './use-panels';
import { CONNECTION_FAILED } from './village-data';

/**
 * Panely z lišty v pořadí, v jakém leží přes scénu: nabídka hry, válka, kronika, upozornění,
 * rod a vazalové, odúmrť a odvody. Otevřená nabídka ostatní panely skryje. Akce panelů rodu
 * a války jdou na server přímo (`negotiate`, `warAction`), ne přes frontu akcí vsi.
 */
export function VillagePanels({
  view,
  viewRef,
  menuShown,
  email,
  onRestart,
  onSignOut,
  panels,
  house,
  chronicle,
  noticeHistory,
  onSelectVillage,
}: {
  view: VillageView | null;
  viewRef: RefObject<VillageView | null>;
  /** Nabídka hry je vidět (po konci hry ne). */
  menuShown: boolean;
  /** E-mail přihlášeného hráče (popisek odhlášení v nabídce). */
  email: string;
  /** Začít znovu z nabídky (se živou vsí). */
  onRestart: () => Promise<string | null>;
  onSignOut: () => Promise<string | null>;
  panels: Panels;
  house: House;
  chronicle: ChronicleControl;
  noticeHistory: NoticesControl;
  onSelectVillage: (village: VillageListItem) => void;
}): ReactElement {
  const { negotiate, refresh: refreshHouse, refreshEscheats } = house;
  const { warAction } = panels;
  return (
    <>
      {menuShown && (
        <GameMenu
          canRestart={view !== null}
          email={email}
          onClose={panels.closeMenu}
          onRestart={onRestart}
          onSignOut={onSignOut}
        />
      )}
      {panels.warOpen && !menuShown && (
        <WarPanel
          view={house.view}
          error={house.error}
          onClose={panels.closeWar}
          ownVillages={(view?.villages ?? [])
            .filter((v) => !v.stewarded)
            .map((v) => ({
              id: v.id,
              name: v.name,
              settlementId: v.settlementId,
              asleep: v.extinct || v.abandoned,
            }))}
          onOfferPeace={(to, items, message) =>
            negotiate(() => openNegotiation({ to, items, message }))
          }
          onSummon={async (warId, vassalageIds) => {
            const targetVillageId = viewRef.current?.id;
            if (!targetVillageId) return { error: CONNECTION_FAILED };
            try {
              const result = await summonVassals({ warId, vassalageIds, targetVillageId });
              if ('error' in result) return result;
              void refreshHouse();
              return { ok: true };
            } catch {
              return { error: CONNECTION_FAILED };
            }
          }}
          protection={panels.protection}
          onRequestProtection={(vassalageId) => {
            const villageId = viewRef.current?.id;
            if (!villageId) return Promise.resolve({ error: CONNECTION_FAILED });
            return warAction(() => requestProtection({ vassalageId, villageId }));
          }}
          onSendProtection={(vassalageId, villageId, men) =>
            warAction(() => sendProtection({ vassalageId, villageId, men }))
          }
          onRecallProtection={(vassalageId, villageId) =>
            warAction(() => recallProtection({ vassalageId, villageId }))
          }
          onAnnouncePassage={(warId, toHouse, message) =>
            warAction(() => announceWarPassage({ warId, house: toHouse, message }))
          }
          passages={panels.passages}
          onAnswerPassage={(passageId, trust) => {
            void answerPassage({ passageId, trust })
              .then(() => panels.refreshPassages())
              .catch(() => undefined);
          }}
        />
      )}
      {chronicle.open && !menuShown && (
        <ChroniclePanel
          page={chronicle.page}
          loading={chronicle.loading}
          error={chronicle.error}
          onOlder={chronicle.loadOlder}
          onClose={chronicle.close}
        />
      )}
      {noticeHistory.open && !menuShown && (
        <NoticesPanel
          page={noticeHistory.page}
          highlightAfter={noticeHistory.highlightAfter}
          loading={noticeHistory.loading}
          error={noticeHistory.error}
          onOlder={noticeHistory.loadOlder}
          onClose={noticeHistory.close}
        />
      )}
      {panels.houseOpen && !menuShown && (
        <HousePanel
          view={house.view}
          error={house.error}
          origin={typeof window === 'undefined' ? null : window.location.origin}
          onIssue={house.issueInvite}
          onRevoke={house.revokeInvite}
          newcomer={house.newcomer}
          onStartFree={() => negotiate(() => startFreeAction())}
          onOpenNegotiation={(to, items, message) =>
            negotiate(() => openNegotiation({ to, items, message }))
          }
          onReply={(negotiationId, reply) =>
            negotiate(() => answerNegotiation({ negotiationId, ...reply }))
          }
          onBlock={(target) => negotiate(() => blockHouse({ target }))}
          onUnblock={(target) => negotiate(() => unblockHouse({ target }))}
          onDeclareWar={(target, items, message) =>
            negotiate(() => declareWarOnHouse({ target, items, message }))
          }
          onFileComplaint={(against, message) =>
            negotiate(() => fileComplaintAction({ against, message }))
          }
          onAnswerComplaint={(disputeId, statement) =>
            negotiate(() => answerComplaintAction({ disputeId, statement }))
          }
          onJudge={(disputeId, verdict) =>
            negotiate(() => judgeDisputeAction({ disputeId, verdict }))
          }
          villages={(view?.villages ?? [])
            .filter((v) => !v.stewarded)
            .map((v) => ({ id: v.id, name: v.name }))}
          captives={view?.manor?.prisoners ?? []}
          gameYear={view ? dateOfDayIndex(view.dayIndex).year : undefined}
          onSpare={async (toHouseId, targetVillageId) => {
            try {
              const result = await houseSpare({
                toHouseId,
                ...(targetVillageId !== null ? { targetVillageId } : {}),
              });
              return 'spare' in result ? result.spare : null;
            } catch {
              return null;
            }
          }}
          onRenounce={(vassalageId, message) =>
            negotiate(() => renounceVassalage({ vassalageId, message }))
          }
          onDismissSteward={(villageId) => negotiate(() => dismissSteward({ villageId }))}
          onOpenLevy={() => void panels.openLevy()}
          onClose={panels.closeHouse}
          onSelectVillage={(villageId) => {
            const target = view?.villages.find((v) => v.id === villageId);
            if (target) onSelectVillage(target);
          }}
        />
      )}
      {house.escheats && !menuShown && (
        <EscheatDialog
          escheats={house.escheats}
          onPropose={async (input) => {
            const result = await proposeEscheat(input);
            if ('ok' in result) {
              void refreshHouse();
              void refreshEscheats();
            }
            return result;
          }}
          onConsent={async (input) => {
            const result = await consentEscheat(input);
            if ('ok' in result) {
              void refreshHouse();
              void refreshEscheats();
            }
            return result;
          }}
          onClose={house.closeEscheats}
        />
      )}
      {panels.levy.open && !menuShown && (
        <LevyDialog
          dialogs={panels.levy.dialogs}
          error={panels.levy.error}
          onAnswer={async (input) => {
            const result = await answerLevy(input);
            if ('ok' in result) void refreshHouse();
            return result;
          }}
          summons={panels.levy.summons}
          onAnswerSummons={async (input) => {
            const result = await answerSummons(input);
            if ('ok' in result) void refreshHouse();
            return result;
          }}
          onClose={panels.closeLevy}
        />
      )}
    </>
  );
}
