'use client';

import { Fragment, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { NEGOTIATION, type MacroSpare, type PanelAgreement, type TermItem } from '@bohemia/game';
import {
  houseLinkOf,
  orderTree,
  type HouseLinkView,
  type HouseView,
  type InviteView,
  type PortraitView,
} from '@/lib/house-view';
import { breachLabel, hungerLabel, termChips, termItemsOf } from '@/lib/terms-view';
import type { HungerLevel } from '@bohemia/game';
import { openingTerms, termRows, type NegotiationView } from '@/lib/negotiation-view';
import { NegotiationCard, type NegotiationReply } from './NegotiationCard';
import { Chip, TermsForm, type TermsContext } from './TermsForm';
import { Tooltip } from './Tooltip';

// Panel „Rod a vazalové“ – první verze (vassalage.md – Co hráč vidí): rod, páni, vazalové, hráči
// podle vzdálenosti a pozvánky. Jako v 0 A.D. jen ikony s čísly, slova v popiscích; výjimkou je
// pozvánkový kód a odkaz (text) a vzkaz v jednání (text hráče). Klik na hráče nabídne Nabídnout
// vazalství / Požádat o přijetí / Blokovat (zašedlé s důvodem u kurzoru), otevřená jednání mají
// kartu s tlačítky podle role (NegotiationCard).

const ICON = '/icons/house';

function Icon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <img src={`${ICON}/${name}.svg`} alt="" width={size} height={size} draggable={false} />;
}

function Portrait({ icon, size = 36 }: { icon: string; size?: number }): ReactElement {
  return (
    <img
      src={`/icons/resources/${icon}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="rounded-sm border border-[#5c4526] bg-[#15100b]"
    />
  );
}

/** Řádek panelu: značka vlevo (popisek řádku) a ikony vpravo. */
function Row({
  label,
  marker,
  testId,
  children,
}: {
  label: string;
  marker: ReactNode;
  testId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-2 border-t border-[#5c4526] py-2 first:border-t-0"
    >
      <Tooltip content={label} placement="left">
        <span
          tabIndex={0}
          aria-label={label}
          className="flex h-7 w-7 shrink-0 items-center justify-center opacity-80"
        >
          {marker}
        </span>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Muž rodu: portrét (klik přepne na jeho ves), u seniora stolec, u hráčova muže praporec
 * (seniorate.md – Co hráč vidí).
 */
function Man({
  man,
  onSelect,
}: {
  man: PortraitView;
  onSelect: (villageId: string) => void;
}): ReactElement {
  return (
    <Tooltip content={man.label}>
      <button
        type="button"
        aria-label={man.label}
        data-testid="house-own-man"
        data-village={man.villageId}
        data-senior={man.senior || undefined}
        data-lord={man.lord || undefined}
        onClick={() => onSelect(man.villageId)}
        className="relative inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-[#f3cf86]"
      >
        <Portrait icon={man.icon} />
        {man.senior && (
          <img
            src={`${ICON}/throne.svg`}
            alt=""
            data-testid="house-senior-mark"
            width={18}
            height={18}
            className="absolute -top-1.5 -right-1.5 h-[18px] w-[18px]"
          />
        )}
        {man.lord && (
          <img
            src={`${ICON}/banner.svg`}
            alt=""
            data-testid="house-lord-mark"
            width={18}
            height={18}
            className="absolute -bottom-1.5 -left-1.5 h-[18px] w-[18px]"
          />
        )}
      </button>
    </Tooltip>
  );
}

/** Cizí rod: portrét hlavy rodu a štít s počtem mužů. */
function HouseLink({
  house,
  testId,
  tip,
  selected,
  onClick,
}: {
  house: HouseLinkView;
  testId: string;
  tip?: string;
  /** Hráč je vybraný (zvýrazněný rámeček). */
  selected?: boolean;
  /** Klik na rod (seznam hráčů); bez něj jde jen o náhled. */
  onClick?: () => void;
}): ReactElement {
  const label = tip ? `${house.label} – ${tip}` : house.label;
  const Wrapper = onClick ? 'button' : 'span';
  return (
    <Tooltip content={label}>
      <Wrapper
        {...(onClick ? { type: 'button' as const, onClick } : { tabIndex: 0 })}
        aria-label={label}
        aria-pressed={onClick ? selected === true : undefined}
        data-testid={testId}
        data-house-id={house.houseId}
        className={`relative inline-flex rounded-sm ${selected ? 'outline-2 outline-[#f3cf86]' : ''}`}
      >
        <Portrait icon={house.icon} />
        <span className="absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center">
          <img
            src={`${ICON}/shield.svg`}
            alt=""
            width={20}
            height={20}
            className="absolute inset-0"
          />
          <span className="relative text-[11px] leading-none font-bold tabular-nums">
            {house.men}
          </span>
        </span>
      </Wrapper>
    </Tooltip>
  );
}

/** Tlačítko akce u cizího hráče; zašedlé nese důvod u kurzoru (`denied`). */
function PlayerAction({
  label,
  icon,
  testId,
  reason,
  busy,
  onClick,
}: {
  label: string;
  icon: string;
  testId: string;
  reason: string | null;
  busy: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip content={label} denied={reason}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        data-reason={reason ?? undefined}
        disabled={busy || reason !== null}
        className="hud-icon-button flex h-8 w-10 items-center justify-center"
        onClick={onClick}
      >
        <Icon name={icon} size={22} />
      </button>
    </Tooltip>
  );
}

/** Zlomená pečeť s počtem neplnění a ikona hladu (jen když je co ukázat). */
function StatusMarks({
  breaches,
  hunger,
}: {
  breaches: number;
  hunger: HungerLevel | null;
}): ReactElement {
  const breach = breachLabel(breaches);
  const hungry = hungerLabel(hunger);
  return (
    <>
      {breach && (
        <Tooltip content={breach}>
          <span
            tabIndex={0}
            aria-label={breach}
            data-testid="house-breaches"
            className="inline-flex items-center gap-0.5"
          >
            <Icon name="seal-broken" size={18} />
            <span className="text-xs tabular-nums">{breaches}</span>
          </span>
        </Tooltip>
      )}
      {hungry && (
        <Tooltip content={hungry}>
          <span
            tabIndex={0}
            aria-label={hungry}
            data-testid="house-hunger"
            data-level={hunger ?? undefined}
            className="inline-flex"
          >
            <Icon name="hunger" size={18} />
          </span>
        </Tooltip>
      )}
    </>
  );
}

/** Pán nebo vazal s dohodou: portrét, ikony podmínek, neplnění a hlad; odsazení podle hloubky. */
function AgreementEntry({
  house,
  testId,
  depth = 0,
  terms,
  breaches,
  hunger,
  villageName,
  selected,
  levy = null,
  onClick,
}: {
  house: HouseLinkView;
  testId: string;
  depth?: number;
  terms: PanelAgreement['terms'] | null;
  breaches: number;
  hunger: HungerLevel | null;
  villageName: (id: string) => string | null;
  selected: boolean;
  /** Čeká dialog Odvody: pán vidí přesýpací hodiny, vazal pečeť, která dialog otevře. */
  levy?: { role: 'lord' | 'vassal'; years: number; onOpen?: () => void } | null;
  onClick?: () => void;
}): ReactElement {
  return (
    <div
      data-testid={`${testId}-entry`}
      data-depth={depth}
      className="flex w-full items-center gap-2"
      style={{ paddingLeft: depth > 1 ? (depth - 1) * 16 : 0 }}
    >
      <HouseLink house={house} testId={testId} selected={selected} onClick={onClick} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {terms && termChips(terms, villageName).map((c) => <Chip key={c.key} chip={c} />)}
        <StatusMarks breaches={breaches} hunger={hunger} />
        {levy && <LevyMark levy={levy} />}
      </div>
    </div>
  );
}

/** Čekající Odvody u dohody: pánovi přesýpací hodiny u vazala, vazalovi pečeť otevírající dialog. */
function LevyMark({
  levy,
}: {
  levy: { role: 'lord' | 'vassal'; years: number; onOpen?: () => void };
}): ReactElement {
  const label =
    levy.role === 'lord'
      ? 'Vazal ještě neodvedl'
      : levy.years > 1
        ? `Odvody čekají už ${levy.years} roky`
        : 'Odvody čekají';
  if (levy.role === 'lord') {
    return (
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} data-testid="house-levy-wait" className="inline-flex">
          <Icon name="hourglass" size={18} />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        data-testid="house-levy-open"
        onClick={levy.onOpen}
        className="hud-icon-button inline-flex h-7 w-7 items-center justify-center"
      >
        <Icon name="seal" size={20} />
      </button>
    </Tooltip>
  );
}

/**
 * Akce nad dohodou po kliku na pána nebo vazala: Nové podmínky (pečeť s perem – formulář nad
 * dohodou, do přijetí platí staré) a Vypovědět (rozetnutý řetěz – vzkaz a potvrzení druhým
 * tlačítkem, ne dialogem prohlížeče).
 */
function AgreementActions({
  agreement,
  house,
  ownHouseId,
  busy,
  context,
  onNewTerms,
  onRenounce,
}: {
  agreement: PanelAgreement;
  house: HouseLinkView;
  ownHouseId: string;
  busy: boolean;
  context: TermsContext;
  onNewTerms: (items: TermItem[], message: string | null) => void;
  onRenounce: (message: string | null) => void;
}): ReactElement {
  const [mode, setMode] = useState<'terms' | 'renounce' | null>(null);
  const [message, setMessage] = useState('');
  return (
    <div data-testid="agreement-actions" className="flex w-full flex-col gap-1.5 pb-1">
      <div className="flex items-center gap-1.5">
        <PlayerAction
          label="Nové podmínky"
          icon="seal-pen"
          testId="agreement-new-terms"
          reason={null}
          busy={busy}
          onClick={() => setMode(mode === 'terms' ? null : 'terms')}
        />
        <PlayerAction
          label="Vypovědět"
          icon="chain-broken"
          testId="agreement-renounce"
          reason={null}
          busy={busy}
          onClick={() => setMode(mode === 'renounce' ? null : 'renounce')}
        />
      </div>
      {mode === 'terms' && (
        <TermsForm
          rows={termRows(termItemsOf(agreement.terms), ownHouseId, house)}
          submitLabel="Nové podmínky"
          submitIcon="seal-pen"
          busy={busy}
          context={context}
          onCancel={() => setMode(null)}
          onSubmit={(items, text) => {
            setMode(null);
            onNewTerms(items, text);
          }}
        />
      )}
      {mode === 'renounce' && (
        <div data-testid="renounce-form" className="flex flex-col gap-1.5">
          <textarea
            aria-label="Vzkaz"
            data-testid="renounce-message"
            value={message}
            rows={2}
            maxLength={NEGOTIATION.messageMaxChars}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <PlayerAction
              label="Potvrdit vypovězení"
              icon="chain-broken"
              testId="renounce-confirm"
              reason={null}
              busy={busy}
              onClick={() => {
                setMode(null);
                onRenounce(message.trim() === '' ? null : message);
              }}
            />
            <PlayerAction
              label="Zrušit"
              icon="cross"
              testId="renounce-cancel"
              reason={null}
              busy={false}
              onClick={() => setMode(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

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
  direction: 'offer' | 'request';
}

/** Odkaz pozvánky: absolutní adresa registrace s kódem (z adresy prohlížeče). */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/register?pozvanka=${code}`;
}

function InviteRow({
  invite,
  onRevoke,
  link,
}: {
  invite: InviteView;
  onRevoke: (code: string) => void;
  link: string | null;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  if (invite.state === 'used') {
    return (
      <div data-testid="house-invite-used" className="flex items-center gap-1.5">
        {invite.invitee ? (
          <HouseLink house={invite.invitee} testId="house-invite-invitee" />
        ) : (
          <Tooltip content={invite.label}>
            <span tabIndex={0} aria-label={invite.label}>
              <Portrait icon="man" />
            </span>
          </Tooltip>
        )}
        {invite.played && (
          <Tooltip content={invite.label}>
            <span tabIndex={0} aria-label={invite.label} data-testid="house-invite-played">
              <Icon name="succession" />
            </span>
          </Tooltip>
        )}
      </div>
    );
  }
  return (
    <div data-testid="house-invite-open" className="flex items-center gap-1.5">
      <Tooltip content={invite.label}>
        <span tabIndex={0} aria-label={invite.label} className="flex items-center gap-0.5">
          <Icon name="hourglass" size={18} />
          <span className="text-xs tabular-nums">{invite.daysLeft}</span>
        </span>
      </Tooltip>
      <span data-testid="house-invite-code" className="font-mono text-sm tracking-wider select-all">
        {invite.display}
      </span>
      {link && (
        <Tooltip content={copied ? 'Zkopírováno' : 'Kopírovat odkaz'}>
          <button
            type="button"
            aria-label="Kopírovat odkaz"
            data-testid="house-invite-copy"
            className="hud-icon-button flex h-6 w-6 items-center justify-center"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            <Icon name="copy" size={16} />
          </button>
        </Tooltip>
      )}
      <Tooltip content="Zrušit pozvánku">
        <button
          type="button"
          aria-label="Zrušit pozvánku"
          data-testid="house-invite-revoke"
          className="hud-icon-button flex h-6 w-6 items-center justify-center"
          onClick={() => onRevoke(invite.code)}
        >
          <Icon name="cross" size={14} />
        </button>
      </Tooltip>
    </div>
  );
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
  villages = [],
  onSpare,
  onRenounce,
  onOpenLevy,
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
  /** Vsi hráče (výběr cílové vsi v podmínkách). */
  villages?: readonly { id: string; name: string }[];
  /** Výhled „kolik můžu postrádat“ pro rod `toHouseId` (jen na vyžádání, při otevření formuláře). */
  onSpare?: (toHouseId: string, targetVillageId: string | null) => Promise<MacroSpare | null>;
  /** Vypoví dohodu `vassalageId` (platí hned) se vzkazem. */
  onRenounce?: (vassalageId: string, message: string | null) => Promise<unknown>;
  /** Otevře dialog Odvody. */
  onOpenLevy?: () => void;
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
    villages,
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
          {view.negotiations.length > 0 && (
            <Row label="Jednání" testId="house-negotiations" marker={<Icon name="seal" />}>
              <div className="flex w-full flex-col gap-2">
                {view.negotiations.map((n) => (
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
                <HouseLink
                  key={h.houseId}
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
                        label="Blokovat"
                        icon="gate"
                        testId="house-block"
                        reason={h.actions.blocked ? 'Zablokován.' : null}
                        busy={busy}
                        onClick={() => {
                          setPickedId(null);
                          run(() => onBlock?.(h.houseId) ?? Promise.resolve());
                        }}
                      />
                    </div>
                    {draft && draft.house.houseId === h.houseId && (
                      <TermsForm
                        key={`${h.houseId}-${draft.direction}`}
                        rows={termRows(
                          openingTerms(draft.direction, view.ownHouseId, h.houseId),
                          view.ownHouseId,
                          h,
                        )}
                        submitLabel={
                          draft.direction === 'offer' ? 'Nabídnout vazalství' : 'Požádat o přijetí'
                        }
                        submitIcon={draft.direction === 'offer' ? 'seal' : 'hands'}
                        busy={busy}
                        context={contextFor(h.houseId, draft.direction === 'offer')}
                        onCancel={() => setDraft(null)}
                        onSubmit={(items, message) => {
                          setDraft(null);
                          setPickedId(null);
                          run(
                            () =>
                              onOpenNegotiation?.(h.houseId, items, message) ?? Promise.resolve(),
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
              <Tooltip content={error ?? 'Vydat pozvánku'}>
                <button
                  type="button"
                  aria-label="Vydat pozvánku"
                  data-testid="house-invite-issue"
                  disabled={busy || view.freeInviteSlots === 0}
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
