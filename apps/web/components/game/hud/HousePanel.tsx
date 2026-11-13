'use client';

import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import type { MacroSpare, TermItem, Verdict } from '@bohemia/game';
import { houseLinkOf, orderTree, type HouseLinkView, type HouseView } from '@/lib/house-view';
import { openingTerms, openingTrade, termRows, type NegotiationView } from '@/lib/negotiation-view';
import { emptyBundle } from '@/lib/terms-view';
import { DisputeCard } from './DisputeCard';
import { NegotiationCard, type NegotiationReply } from './NegotiationCard';
import { NewcomerWaiting } from './NewcomerPanel';
import { newcomerWaiting, type NewcomerStatusView } from '@/lib/newcomer-view';
import { TermsForm, type TermsContext } from './TermsForm';
import { KnownMapEye } from './KnownMapEye';
import { Tooltip } from './Tooltip';
import { DomainFoodRows } from './DomainFood';
import { HouseLink, Icon, Man, PlayerAction, Portrait, Row } from './house/parts';
import { AgreementActions, AgreementEntry } from './house/agreements';
import { FellowComplaint } from './house/FellowComplaint';
import { InviteRow, inviteLink } from './house/invites';

export { inviteLink } from './house/invites';

// Panel „Rod a vazalové“ – první verze (vassalage.md – Co hráč vidí): rod, páni, vazalové, hráči
// podle vzdálenosti a pozvánky. Jako v 0 A.D. jen ikony s čísly, slova v popiscích; výjimkou je
// pozvánkový kód a odkaz (text) a vzkaz v jednání (text hráče). Klik na hráče nabídne Nabídnout
// vazalství / Požádat o přijetí / Blokovat (zašedlé s důvodem u kurzoru), otevřená jednání mají
// kartu s tlačítky podle role (NegotiationCard).

/**
 * Je v jednání hráčův rod pánem? Z přísahy v podmínkách; změna podmínek existující dohody přísahu
 * nemá, tam rozhoduje dohoda s druhou stranou.
 */
function lordIsOwnIn(n: NegotiationView, view: HouseView): boolean {
  for (const row of n.rows) {
    if (row.item.kind === 'oath') return row.item.lord === view.ownHouseId;
  }
  return view.agreements.some((a) => a.otherHouseId === n.other.houseId && a.other === 'vassal');
}

/** Rozpracovaná nabídka: komu a v které roli je hráč (pán / vazal). */
interface Draft {
  house: HouseLinkView;
  direction: 'offer' | 'request' | 'trade' | 'war' | 'ransom';
}

/**
 * Panel „Rod a vazalové“. `view` je null, dokud se načítá; `error` je důvod selhání česky (u
 * kurzoru jako text pod řadou pozvánek). `onIssue` vydá kód (vrací kód, nebo chybu), `onRevoke`
 * zruší kód; po obou si rodič obnoví `view`.
 */
export function HousePanel({
  view,
  error,
  origin,
  onIssue,
  onRevoke,
  onClose,
  onSelectVillage,
  onOpenNegotiation,
  onReply,
  onBlock,
  onUnblock,
  onDeclareWar,
  villages = [],
  captives = [],
  onSpare,
  onRenounce,
  onDismissSteward,
  onOpenLevy,
  onFileComplaint,
  onAnswerComplaint,
  onJudge,
  gameYear,
  newcomer = null,
  onStartFree,
}: {
  view: HouseView | null;
  error: string | null;
  /** Adresa webu pro odkaz pozvánky (`window.location.origin`); bez ní se odkaz nenabízí. */
  origin: string | null;
  onIssue: () => Promise<unknown>;
  onRevoke: (code: string) => Promise<unknown>;
  onClose: () => void;
  /** Klik na portrét muže rodu přepne pohled na jeho ves. */
  onSelectVillage?: (villageId: string) => void;
  /** Odešle nabídku jednání (id rodu, podmínky, vzkaz); po ní si rodič obnoví `view`. */
  onOpenNegotiation?: (to: string, items: TermItem[], message: string | null) => Promise<unknown>;
  /** Odpoví na jednání (přijmout, odmítnout, stáhnout, protinávrh). */
  onReply?: (negotiationId: string, reply: NegotiationReply) => Promise<unknown>;
  /** Zablokuje rod. */
  onBlock?: (houseId: string) => Promise<unknown>;
  onUnblock?: (houseId: string) => Promise<unknown>;
  /** Opoví válku rodu (id rodu, požadavek jako podmínky míru, vzkaz). */
  onDeclareWar?: (to: string, items: TermItem[], message: string | null) => Promise<unknown>;
  /** Vsi hráče (výběr cílové vsi v podmínkách). */
  villages?: readonly { id: string; name: string }[];
  /** Zajatci držení hráčem (výkupné; war.md – Vzdaní, zajetí a výkupné); bez nich se výkupné nenabízí. */
  captives?: NonNullable<TermsContext['captives']>;
  /** Výhled „kolik můžu postrádat“ pro rod `toHouseId` (jen na vyžádání, při otevření formuláře). */
  onSpare?: (toHouseId: string, targetVillageId: string | null) => Promise<MacroSpare | null>;
  /** Vypoví dohodu `vassalageId` (platí hned) se vzkazem. */
  onRenounce?: (vassalageId: string, message: string | null) => Promise<unknown>;
  /** Odvolá správce vsi `villageId` (platí hned, vazalství trvá). */
  onDismissSteward?: (villageId: string) => Promise<unknown>;
  /** Otevře dialog Odvody. */
  onOpenLevy?: () => void;
  /** Žaloba na spoluvazala (id rodu, vzkaz pánovi). */
  onFileComplaint?: (against: string, message: string) => Promise<unknown>;
  /** Vyjádření obžalovaného ke sporu. */
  onAnswerComplaint?: (disputeId: string, statement: string) => Promise<unknown>;
  /** Rozsudek pána. */
  onJudge?: (disputeId: string, verdict: Verdict) => Promise<unknown>;
  /** Herní rok (výchozí rok první splátky půjčky). */
  gameYear?: number;
  /** Stav odříznutého nováčka – čekání na pána (newcomers.md – Čekání); null – není nováček. */
  newcomer?: NewcomerStatusView | null;
  /** Stáhne žádosti nováčka a začne svobodný. */
  onStartFree?: () => Promise<unknown>;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  // vybraný cizí hráč (tlačítka akcí) a rozpracovaná nabídka (formulář podmínek)
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // vybraná dohoda (pán nebo přímý vazal) – akce Nové podmínky a Vypovědět
  const [pickedAgreement, setPickedAgreement] = useState<string | null>(null);
  const villageName = (id: string): string | null =>
    villages.find((v) => v.id === id)?.name ?? null;
  const contextFor = (houseId: string, lordIsOwn: boolean): TermsContext => ({
    lordIsOwn,
    ...(view ? { ownHouseId: view.ownHouseId } : {}),
    villages,
    // výkupné jen za zajatce protistrany (rod zná server; bez údaje se nenabízí)
    ...(captives.some((c) => c.houseId === houseId)
      ? { captives: captives.filter((c) => c.houseId === houseId) }
      : {}),
    ...(gameYear !== undefined ? { gameYear } : {}),
    ...(onSpare ? { loadSpare: (target) => onSpare(houseId, target) } : {}),
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const run = (task: () => Promise<unknown>): void => {
    setBusy(true);
    void task().finally(() => setBusy(false));
  };
  // vlastní žádosti odříznutého nováčka ukazuje čekání (stav ikonou), ne karty jednání
  const negotiations = (view?.negotiations ?? []).filter(
    (n) => !(view?.isolated && n.newcomer && !n.myTurn),
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Rod a vazalové"
      data-testid="house-panel"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      {!view ? (
        <div className="py-4 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : (
        <>
          {error && (
            <span data-testid="house-error" className="block pb-1 text-xs text-red-400">
              {error}
            </span>
          )}
          <Row label="Rod" testId="house-own" marker={<Portrait icon="people" size={22} />}>
            {view.own.map((m, i) => (
              <Man key={i} man={m} onSelect={(id) => onSelectVillage?.(id)} />
            ))}
            {view.successionCredits > 0 && (
              <Tooltip content="Nástupnictví bez losu">
                <span
                  tabIndex={0}
                  aria-label="Nástupnictví bez losu"
                  data-testid="house-succession-credits"
                  className="ml-auto inline-flex items-center gap-0.5"
                >
                  <Icon name="seal" size={24} />
                  <span className="text-sm font-semibold tabular-nums">
                    {view.successionCredits}
                  </span>
                </span>
              </Tooltip>
            )}
          </Row>
          {newcomer?.phase === 'isolated' && newcomerWaiting(newcomer) && (
            <Row label="Čekání na pána" testId="house-newcomer" marker={<Icon name="hourglass" />}>
              <NewcomerWaiting
                status={newcomer}
                busy={busy}
                onWithdraw={() => run(() => onStartFree?.() ?? Promise.resolve())}
              />
            </Row>
          )}
          {view.domainFood && (
            <Row label="Jídlo domény" testId="house-food" marker={<Icon name="grain" />}>
              <DomainFoodRows
                food={view.domainFood}
                renderHouse={(h, testId) => <HouseLink house={h} testId={testId} />}
              />
            </Row>
          )}
          <Row label="Páni" testId="house-lords" marker={<Icon name="banner" />}>
            {view.lords.length === 0 ? (
              <Tooltip content="Nezávislý">
                <span tabIndex={0} aria-label="Nezávislý" data-testid="house-independent">
                  <Icon name="banner" size={32} />
                </span>
              </Tooltip>
            ) : (
              view.lords.map((h) => {
                const agreement = view.agreements.find((x) => x.otherHouseId === h.houseId);
                return (
                  <Fragment key={h.houseId}>
                    <AgreementEntry
                      house={h}
                      testId="house-lord"
                      terms={agreement?.terms ?? null}
                      breaches={0}
                      hunger={null}
                      villageName={villageName}
                      levy={
                        agreement && agreement.levyYears !== null
                          ? { role: 'vassal', years: agreement.levyYears, onOpen: onOpenLevy }
                          : null
                      }
                      selected={
                        agreement !== undefined && pickedAgreement === agreement.vassalageId
                      }
                      onClick={
                        agreement
                          ? () =>
                              setPickedAgreement(
                                pickedAgreement === agreement.vassalageId
                                  ? null
                                  : agreement.vassalageId,
                              )
                          : undefined
                      }
                    />
                    {agreement && pickedAgreement === agreement.vassalageId && (
                      <AgreementActions
                        key={agreement.vassalageId}
                        agreement={agreement}
                        house={h}
                        ownHouseId={view.ownHouseId}
                        busy={busy}
                        context={contextFor(h.houseId, false)}
                        onNewTerms={(items, message) => {
                          setPickedAgreement(null);
                          run(
                            () =>
                              onOpenNegotiation?.(h.houseId, items, message) ?? Promise.resolve(),
                          );
                        }}
                        onRenounce={(message) => {
                          setPickedAgreement(null);
                          run(
                            () => onRenounce?.(agreement.vassalageId, message) ?? Promise.resolve(),
                          );
                        }}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </Row>
          {view.stewardships.length > 0 && (
            <Row label="Správci vsí" testId="house-stewards" marker={<Icon name="village-key" />}>
              {view.stewardships.map((st) => (
                <div
                  key={st.villageId}
                  data-testid="house-steward"
                  className="flex items-center gap-1.5"
                >
                  <span className="text-xs">
                    {st.villageName}
                    {st.steward?.lordName ? ` – ${st.steward.lordName}` : ''}
                  </span>
                  <PlayerAction
                    label="Odvolat"
                    icon="chain-broken"
                    testId={`steward-dismiss-${st.villageId}`}
                    reason={null}
                    busy={busy}
                    onClick={() => run(() => onDismissSteward?.(st.villageId) ?? Promise.resolve())}
                  />
                </div>
              ))}
            </Row>
          )}
          {view.vassals.length > 0 && (
            <Row label="Vazalové" testId="house-vassals" marker={<Icon name="shield" />}>
              {(view.tree.length > 0 ? orderTree(view.tree, view.ownHouseId) : []).map((node) => {
                const h = houseLinkOf(node.house);
                const agreement =
                  node.depth === 1
                    ? view.agreements.find((x) => x.vassalageId === node.vassalageId)
                    : undefined;
                return (
                  <Fragment key={node.vassalageId}>
                    <AgreementEntry
                      house={h}
                      testId={node.depth === 1 ? 'house-vassal' : 'house-subvassal'}
                      depth={node.depth}
                      terms={node.terms}
                      breaches={node.breaches}
                      hunger={node.hunger}
                      villageName={villageName}
                      levy={
                        agreement && agreement.levyYears !== null
                          ? { role: 'lord', years: agreement.levyYears }
                          : null
                      }
                      selected={agreement !== undefined && pickedAgreement === node.vassalageId}
                      onClick={
                        agreement
                          ? () =>
                              setPickedAgreement(
                                pickedAgreement === node.vassalageId ? null : node.vassalageId,
                              )
                          : undefined
                      }
                    />
                    {agreement && pickedAgreement === node.vassalageId && (
                      <AgreementActions
                        key={node.vassalageId}
                        agreement={agreement}
                        house={h}
                        ownHouseId={view.ownHouseId}
                        busy={busy}
                        context={contextFor(h.houseId, true)}
                        disputes={view.disputes.filter(
                          (d) =>
                            d.role === 'lord' &&
                            (d.plaintiff.houseId === h.houseId ||
                              d.defendant.houseId === h.houseId),
                        )}
                        onAnswer={(id, text) =>
                          run(() => onAnswerComplaint?.(id, text) ?? Promise.resolve())
                        }
                        onJudge={(id, verdict) =>
                          run(() => onJudge?.(id, verdict) ?? Promise.resolve())
                        }
                        onNewTerms={(items, message) => {
                          setPickedAgreement(null);
                          run(
                            () =>
                              onOpenNegotiation?.(h.houseId, items, message) ?? Promise.resolve(),
                          );
                        }}
                        onRenounce={(message) => {
                          setPickedAgreement(null);
                          run(() => onRenounce?.(node.vassalageId, message) ?? Promise.resolve());
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
              {view.tree.length === 0 &&
                view.vassals.map((h) => (
                  <HouseLink key={h.houseId} house={h} testId="house-vassal" />
                ))}
            </Row>
          )}
          {(view.disputes.length > 0 || view.fellows.length > 0) && (
            <Row label="Spory" testId="house-disputes" marker={<Icon name="scales" />}>
              <div className="flex w-full flex-col gap-1.5">
                {view.fellows.map((f) => (
                  <FellowComplaint
                    key={f.house.houseId}
                    fellow={f}
                    busy={busy}
                    onFile={(message) =>
                      run(() => onFileComplaint?.(f.house.houseId, message) ?? Promise.resolve())
                    }
                  />
                ))}
                {view.disputes.map((d) => (
                  <DisputeCard
                    key={d.id}
                    dispute={d}
                    busy={busy}
                    onAnswer={(id, text) =>
                      run(() => onAnswerComplaint?.(id, text) ?? Promise.resolve())
                    }
                    onJudge={(id, verdict) =>
                      run(() => onJudge?.(id, verdict) ?? Promise.resolve())
                    }
                  />
                ))}
              </div>
            </Row>
          )}
          {negotiations.length > 0 && (
            <Row label="Jednání" testId="house-negotiations" marker={<Icon name="seal" />}>
              <div className="flex w-full flex-col gap-2">
                {negotiations.map((n) => (
                  <NegotiationCard
                    key={n.id}
                    negotiation={n}
                    busy={busy}
                    context={contextFor(n.other.houseId, lordIsOwnIn(n, view))}
                    portrait={<HouseLink house={n.other} testId="house-negotiation-other" />}
                    onReply={(id, reply) => run(() => onReply?.(id, reply) ?? Promise.resolve())}
                  />
                ))}
              </div>
            </Row>
          )}
          {view.others.length > 0 && (
            <Row label="Hráči" testId="house-others" marker={<Portrait icon="man" size={22} />}>
              {view.others.map((h) => (
                <span key={h.houseId} className="inline-flex items-center gap-1">
                  <HouseLink
                    house={h}
                    testId="house-other"
                    tip={`${h.distance} ${h.distance === 1 ? 'pole' : 'polí'} daleko`}
                    selected={pickedId === h.houseId}
                    onClick={
                      h.actions
                        ? () => {
                            setDraft(null);
                            setPickedId(pickedId === h.houseId ? null : h.houseId);
                          }
                        : undefined
                    }
                  />
                  <KnownMapEye houseId={h.houseId} />
                </span>
              ))}
              {view.others.map((h) =>
                h.actions && pickedId === h.houseId ? (
                  <div
                    key={`actions-${h.houseId}`}
                    data-testid="house-actions"
                    className="flex w-full flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <PlayerAction
                        label="Nabídnout vazalství"
                        icon="seal"
                        testId="house-offer"
                        reason={h.actions.offer}
                        busy={busy}
                        onClick={() => setDraft({ house: h, direction: 'offer' })}
                      />
                      <PlayerAction
                        label="Požádat o přijetí"
                        icon="hands"
                        testId="house-request"
                        reason={h.actions.request}
                        busy={busy}
                        onClick={() => setDraft({ house: h, direction: 'request' })}
                      />
                      <PlayerAction
                        label="Obchod"
                        icon="cart"
                        testId="house-trade"
                        reason={h.actions.blocked ? 'Zablokován.' : null}
                        busy={busy}
                        onClick={() => setDraft({ house: h, direction: 'trade' })}
                      />
                      {captives.some((c) => c.houseId === h.houseId) && (
                        <PlayerAction
                          label="Výkupné zajatců"
                          icon="seal"
                          testId="house-ransom"
                          reason={null}
                          busy={busy}
                          onClick={() => setDraft({ house: h, direction: 'ransom' })}
                        />
                      )}
                      <PlayerAction
                        label="Opovědět válku"
                        icon="spears"
                        testId="house-war"
                        reason={h.actions.war}
                        busy={busy}
                        onClick={() => setDraft({ house: h, direction: 'war' })}
                      />
                      {h.actions.blocked ? (
                        <PlayerAction
                          label="Odblokovat"
                          icon="gate-open"
                          testId="house-unblock"
                          reason={null}
                          busy={busy}
                          onClick={() => {
                            setPickedId(null);
                            run(() => onUnblock?.(h.houseId) ?? Promise.resolve());
                          }}
                        />
                      ) : (
                        <PlayerAction
                          label="Blokovat"
                          icon="gate"
                          testId="house-block"
                          reason={null}
                          busy={busy}
                          onClick={() => {
                            setPickedId(null);
                            run(() => onBlock?.(h.houseId) ?? Promise.resolve());
                          }}
                        />
                      )}
                    </div>
                    {draft && draft.house.houseId === h.houseId && (
                      <TermsForm
                        key={`${h.houseId}-${draft.direction}`}
                        rows={termRows(
                          draft.direction === 'trade'
                            ? openingTrade(view.ownHouseId, villages[0]?.id ?? null)
                            : draft.direction === 'war'
                              ? []
                              : draft.direction === 'ransom'
                                ? [
                                    {
                                      kind: 'ransom',
                                      prisonerIds: [],
                                      price: { ...emptyBundle(), grainKg: 100 },
                                    },
                                  ]
                                : openingTerms(draft.direction, view.ownHouseId, h.houseId),
                          view.ownHouseId,
                          h,
                        )}
                        submitLabel={
                          draft.direction === 'offer'
                            ? 'Nabídnout vazalství'
                            : draft.direction === 'trade'
                              ? 'Nabídnout obchod'
                              : draft.direction === 'war'
                                ? 'Opovědět válku'
                                : draft.direction === 'ransom'
                                  ? 'Nabídnout výkupné'
                                  : 'Požádat o přijetí'
                        }
                        submitIcon={
                          draft.direction === 'offer'
                            ? 'seal'
                            : draft.direction === 'trade'
                              ? 'cart'
                              : draft.direction === 'war'
                                ? 'spears'
                                : draft.direction === 'ransom'
                                  ? 'seal'
                                  : 'hands'
                        }
                        allowEmpty={draft.direction === 'war'}
                        busy={busy}
                        context={{
                          ...contextFor(h.houseId, draft.direction === 'offer'),
                          ...(draft.direction === 'war' ? { demandFor: h.houseId } : {}),
                        }}
                        onCancel={() => setDraft(null)}
                        onSubmit={(items, message) => {
                          const war = draft.direction === 'war';
                          setDraft(null);
                          setPickedId(null);
                          run(() =>
                            war
                              ? (onDeclareWar?.(h.houseId, items, message) ?? Promise.resolve())
                              : (onOpenNegotiation?.(h.houseId, items, message) ??
                                Promise.resolve()),
                          );
                        }}
                      />
                    )}
                  </div>
                ) : null,
              )}
            </Row>
          )}
          <Row label="Pozvánky" testId="house-invites" marker={<Icon name="seal" />}>
            <div className="flex w-full flex-col gap-1.5">
              <Tooltip content={error ?? 'Vydat pozvánku'} denied={view.inviteReason}>
                <button
                  type="button"
                  aria-label="Vydat pozvánku"
                  data-testid="house-invite-issue"
                  data-reason={view.inviteReason ?? undefined}
                  disabled={busy || view.freeInviteSlots === 0 || view.inviteReason !== null}
                  className="hud-icon-button flex h-8 w-14 items-center justify-center gap-1"
                  onClick={() => run(onIssue)}
                >
                  <Icon name="seal" size={22} />
                  <span
                    data-testid="house-invite-slots"
                    className="text-sm font-semibold tabular-nums"
                  >
                    {view.freeInviteSlots}
                  </span>
                </button>
              </Tooltip>
              {view.invites.map((invite) => (
                <InviteRow
                  key={invite.code}
                  invite={invite}
                  link={origin ? inviteLink(origin, invite.code) : null}
                  onRevoke={(code) => run(() => onRevoke(code))}
                />
              ))}
            </div>
          </Row>
        </>
      )}
    </div>
  );
}
