'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { dateOfDayIndex, type TermItem } from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import type { HouseView } from '@/lib/house-view';
import { cedeBlockReason, type CedeVillage } from '@/lib/peace-cede';
import type { ProtectionView } from '@/lib/protection';
import type { PassageView } from '@/lib/summons';
import { Tooltip } from './Tooltip';

// Panel války (war.md – Co hráč vidí): textový přehled válek rodu – s kým, od kdy, jak začala
// a v jakém je stavu. Panel je textový záměrně (výjimka z pravidla „bez popisků“ stejně jako
// panel Vojsko); mírové jednání a svolání vazalů přibudou s dalšími úlohami války.

const ICON = '/icons/house';

const NO_BUNDLE = {
  cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
  horses: 0,
  logs: 0,
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
  hayKg: 0,
};

/**
 * Nabídka míru (war.md – Konec války): poplatek v obilí (platí buď ty, nebo druhá strana), tribut
 * a volitelně vazalství. Prázdná nabídka je mír bez podmínek. Ostatní podmínky (postoupení vsí)
 * jdou protinávrhem; čísla a důvody odmítnutí hlídá server.
 */
function PeaceForm({
  ownHouseId,
  otherId,
  ownVillages,
  otherVillages,
  onSubmit,
}: {
  ownHouseId: string;
  otherId: string;
  ownVillages: readonly CedeVillage[];
  otherVillages: readonly CedeVillage[];
  onSubmit: (items: TermItem[]) => void;
}): ReactElement {
  const [fee, setFee] = useState('');
  const [payer, setPayer] = useState<'own' | 'other'>('own');
  const [tribute, setTribute] = useState('');
  const [vassalage, setVassalage] = useState<'none' | 'lord' | 'vassal'>('none');
  const [cedeSide, setCedeSide] = useState<'none' | 'own' | 'other'>('none');
  const [ceded, setCeded] = useState<ReadonlySet<string>>(new Set());
  const cedeList = cedeSide === 'own' ? ownVillages : cedeSide === 'other' ? otherVillages : [];
  const toggleCede = (id: string): void =>
    setCeded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const submit = (): void => {
    const payerId = payer === 'own' ? ownHouseId : otherId;
    const line: Extract<TermItem, { kind: 'peace' }> = { kind: 'peace' };
    const feeKg = Number(fee);
    if (feeKg > 0) {
      line.fee = { ...NO_BUNDLE, grainKg: feeKg };
      line.payer = payerId;
    }
    const tributeKg = Number(tribute);
    if (tributeKg > 0)
      line.tribute = { goods: { ...NO_BUNDLE, grainKg: tributeKg }, payer: payerId };
    if (vassalage !== 'none') {
      line.vassalage =
        vassalage === 'lord'
          ? { lord: ownHouseId, vassal: otherId, terms: {} }
          : { lord: otherId, vassal: ownHouseId, terms: {} };
    }
    if (cedeSide !== 'none' && ceded.size > 0) line.cede = [...ceded];
    onSubmit([line]);
  };
  return (
    <div data-testid="peace-form" className="flex flex-col gap-1 pt-1 text-xs">
      <label className="flex items-center gap-1">
        <img src={`${ICON}/grain.svg`} alt="" width={16} height={16} draggable={false} />
        <input
          data-testid="peace-fee"
          type="number"
          min={0}
          aria-label="Poplatek (kg obilí)"
          className="w-20 rounded-sm border border-[#5c4526] bg-[#15100b] px-1"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <select
          data-testid="peace-payer"
          aria-label="Kdo platí"
          className="rounded-sm border border-[#5c4526] bg-[#15100b]"
          value={payer}
          onChange={(e) => setPayer(e.target.value === 'other' ? 'other' : 'own')}
        >
          <option value="own">platím já</option>
          <option value="other">platí on</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <img src={`${ICON}/grain.svg`} alt="" width={16} height={16} draggable={false} />
        <input
          data-testid="peace-tribute"
          type="number"
          min={0}
          aria-label="Roční tribut (kg obilí)"
          className="w-20 rounded-sm border border-[#5c4526] bg-[#15100b] px-1"
          value={tribute}
          onChange={(e) => setTribute(e.target.value)}
        />
        <span className="opacity-70">ročně</span>
      </label>
      <select
        data-testid="peace-vassalage"
        aria-label="Vazalství"
        className="rounded-sm border border-[#5c4526] bg-[#15100b]"
        value={vassalage}
        onChange={(e) =>
          setVassalage(
            e.target.value === 'lord' || e.target.value === 'vassal' ? e.target.value : 'none',
          )
        }
      >
        <option value="none">bez vazalství</option>
        <option value="lord">on se stane mým vazalem</option>
        <option value="vassal">stanu se jeho vazalem</option>
      </select>
      <select
        data-testid="peace-cede-side"
        aria-label="Postoupení vsí"
        className="rounded-sm border border-[#5c4526] bg-[#15100b]"
        value={cedeSide}
        onChange={(e) => {
          setCedeSide(
            e.target.value === 'own' || e.target.value === 'other' ? e.target.value : 'none',
          );
          setCeded(new Set());
        }}
      >
        <option value="none">bez postoupení vsí</option>
        <option value="own">postoupím já</option>
        <option value="other">postoupí on</option>
      </select>
      {cedeList.length > 0 && (
        <ul data-testid="peace-cede-list" className="flex flex-col gap-0.5">
          {cedeList.map((v) => {
            // bez poslední mapy rodu – u cizí strany mapy neznáme, ověří to server
            const reason = cedeSide === 'own' ? cedeBlockReason(ownVillages, ceded, v.id) : null;
            return (
              <li key={v.id}>
                <Tooltip content={v.name} denied={reason}>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      data-testid="peace-cede-village"
                      data-village-id={v.id}
                      data-reason={reason ?? undefined}
                      disabled={reason !== null}
                      checked={ceded.has(v.id)}
                      onChange={() => toggleCede(v.id)}
                    />
                    <span>{v.name}</span>
                  </label>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        data-testid="peace-send"
        className="hud-icon-button flex h-7 items-center justify-center gap-1 px-2"
        onClick={submit}
      >
        <img src={`${ICON}/seal.svg`} alt="" width={16} height={16} draggable={false} />
        Nabídnout mír
      </button>
    </div>
  );
}

/** Panel války; `view` je pohled na rod (války z panelu rodu). */
type ActionResult = { ok: true } | { error: string };

/**
 * Svolání vazalů ve válce (vassalage.md – Svolání; war.md – Co hráč vidí): přímí vazalové se
 * štítem s počtem mužů schopných služby a rohem ke svolání; bez domluvené služby zašedlý roh.
 */
function SummonList({
  view,
  warId,
  onSummon,
}: {
  view: HouseView;
  warId: string;
  onSummon: (warId: string, vassalageIds: string[]) => Promise<ActionResult>;
}): ReactElement {
  const [status, setStatus] = useState<string | null>(null);
  const vassals = view.tree.filter((n) => n.depth === 1);
  if (vassals.length === 0) {
    return <p className="pt-1 text-xs opacity-70">Nemáš vazaly.</p>;
  }
  const summon = async (ids: string[]): Promise<void> => {
    const result = await onSummon(warId, ids);
    setStatus('error' in result ? result.error : null);
  };
  return (
    <div data-testid="war-summon-list" className="flex flex-col gap-1 pt-1">
      {vassals.map((node) => {
        const service = node.terms.service;
        return (
          <div key={node.vassalageId} className="flex items-center gap-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {node.house.lordName ?? 'Rod bez jména'}
            </span>
            <Tooltip content="Muži schopní služby">
              <span
                tabIndex={0}
                data-testid="war-vassal-shield"
                className="inline-flex items-center gap-0.5"
              >
                <img src={`${ICON}/shield.svg`} alt="" width={14} height={14} draggable={false} />
                {node.shield}
              </span>
            </Tooltip>
            <Tooltip
              content={
                service
                  ? `Svolat – ${service.men} mužů na ${service.days} dní`
                  : 'Vazal službu nedomluvil.'
              }
            >
              <button
                type="button"
                aria-label="Svolat"
                data-testid="war-summon-vassal"
                data-vassalage-id={node.vassalageId}
                disabled={!service}
                className="hud-icon-button flex h-6 w-6 items-center justify-center disabled:opacity-40"
                onClick={() => void summon([node.vassalageId])}
              >
                <img src={`${ICON}/horn.svg`} alt="" width={14} height={14} draggable={false} />
              </button>
            </Tooltip>
          </div>
        );
      })}
      {status && (
        <span data-testid="war-summon-error" className="text-xs text-[#e0a090]">
          {status}
        </span>
      )}
    </div>
  );
}

const iconButton = 'hud-icon-button flex h-6 w-6 items-center justify-center disabled:opacity-40';

function Icon({ src, size = 14 }: { src: string; size?: number }): ReactElement {
  return <img src={src} alt="" width={size} height={size} draggable={false} />;
}

/**
 * Ohlášení průchodu z války (war.md – Pohyb): rodům, kterými vojsko půjde, vzkaz a podání ruky;
 * mapy (trasa k nepříteli) dopočte server.
 */
function PassageAnnounce({
  houses,
  warId,
  onAnnounce,
}: {
  houses: readonly { houseId: string; lordName: string | null }[];
  warId: string;
  onAnnounce: (warId: string, house: string, message: string) => Promise<ActionResult>;
}): ReactElement {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<readonly string[]>([]);
  return (
    <div data-testid="war-passage-list" className="flex flex-col gap-1 pt-1">
      <Tooltip content="Vzkaz">
        <input
          type="text"
          data-testid="war-passage-message"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-sm border border-[#5c4526] bg-[#0f0b07] px-1 py-0.5 text-xs"
        />
      </Tooltip>
      {houses.map((h) => (
        <div key={h.houseId} className="flex items-center gap-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{h.lordName ?? 'Rod bez jména'}</span>
          <Tooltip content={done.includes(h.houseId) ? 'Průchod ohlášen' : 'Ohlásit průchod'}>
            <button
              type="button"
              aria-label="Ohlásit průchod"
              data-testid="war-announce-passage"
              data-house-id={h.houseId}
              disabled={done.includes(h.houseId)}
              className={iconButton}
              onClick={() =>
                void onAnnounce(warId, h.houseId, message).then((result) => {
                  setStatus('error' in result ? result.error : null);
                  if (!('error' in result)) setDone((d) => [...d, h.houseId]);
                })
              }
            >
              <Icon src={`${ICON}/passage.svg`} />
            </button>
          </Tooltip>
        </div>
      ))}
      {status && <span className="text-xs text-[#e0a090]">{status}</span>}
    </div>
  );
}

/**
 * Ochrana vojskem (vassalage.md – Ochrana vojskem): štít s muži pána na ochraně zobrazené vsi,
 * žádost u pánů (sepjaté ruce), u vsí vazalů počet mužů, poslat a odvolat.
 */
function ProtectionRows({
  protection,
  onRequest,
  onSend,
  onRecall,
}: {
  protection: ProtectionView;
  onRequest: (vassalageId: string) => Promise<ActionResult>;
  onSend: (vassalageId: string, villageId: string, men: number) => Promise<ActionResult>;
  onRecall: (vassalageId: string, villageId: string) => Promise<ActionResult>;
}): ReactElement {
  const [men, setMen] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string | null>(null);
  const run = (action: Promise<ActionResult>): void => {
    void action.then((result) => setStatus('error' in result ? result.error : null));
  };
  return (
    <div
      data-testid="war-protection"
      className="mt-2 flex flex-col gap-1 border-t border-[#5c4526] pt-2"
    >
      <div className="flex items-center gap-1.5 text-xs">
        <Tooltip content="Muži pána na ochraně této vsi">
          <span tabIndex={0} data-testid="war-guards" className="inline-flex items-center gap-0.5">
            <Icon src={`${ICON}/shield.svg`} />
            {protection.guards}
          </span>
        </Tooltip>
        {protection.lords.map((lord) => (
          <Tooltip key={lord.vassalageId} content={`Požádat o ochranu – ${lord.name}`}>
            <button
              type="button"
              aria-label="Požádat o ochranu"
              data-testid="war-request-protection"
              data-vassalage-id={lord.vassalageId}
              className={iconButton}
              onClick={() => run(onRequest(lord.vassalageId))}
            >
              <Icon src={`${ICON}/hands.svg`} />
            </button>
          </Tooltip>
        ))}
      </div>
      {protection.vassalVillages.map((v) => {
        const key = `${v.vassalageId}:${v.villageId}`;
        const count = Math.min(men[key] ?? 1, Math.max(1, protection.serviceMen));
        return (
          <div
            key={key}
            data-testid="war-guard-village"
            data-village-id={v.villageId}
            className="flex items-center gap-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">{v.villageName}</span>
            <Tooltip content="Tvoji muži na ochraně">
              <span
                tabIndex={0}
                data-testid="war-guard-sent"
                className="inline-flex items-center gap-0.5"
              >
                <Icon src={`${ICON}/shield.svg`} />
                {v.sent}
              </span>
            </Tooltip>
            <Tooltip content="Kolik mužů poslat">
              <input
                type="number"
                data-testid="war-guard-count"
                min={1}
                max={Math.max(1, protection.serviceMen)}
                value={count}
                onChange={(e) => setMen((m) => ({ ...m, [key]: Number(e.target.value) || 1 }))}
                className="w-10 rounded-sm border border-[#5c4526] bg-[#0f0b07] px-1 text-xs"
              />
            </Tooltip>
            <Tooltip content="Poslat muže na ochranu">
              <button
                type="button"
                aria-label="Poslat muže na ochranu"
                data-testid="war-guard-send"
                disabled={protection.serviceMen === 0}
                className={iconButton}
                onClick={() => run(onSend(v.vassalageId, v.villageId, count))}
              >
                <Icon src={`${ICON}/guard-send.svg`} />
              </button>
            </Tooltip>
            <Tooltip content="Odvolat muže">
              <button
                type="button"
                aria-label="Odvolat muže"
                data-testid="war-guard-recall"
                disabled={v.sent === 0}
                className={iconButton}
                onClick={() => run(onRecall(v.vassalageId, v.villageId))}
              >
                <Icon src={`${ICON}/guard-recall.svg`} />
              </button>
            </Tooltip>
          </div>
        );
      })}
      {status && (
        <span data-testid="war-protection-error" className="text-xs text-[#e0a090]">
          {status}
        </span>
      )}
    </div>
  );
}

/** Ohlášení průchodu (war.md – Pohyb): vzít na vědomí, nebo „Nevěřit“. */
function PassageRows({
  passages,
  onAnswer,
}: {
  passages: readonly PassageView[];
  onAnswer: (passageId: string, trust: boolean) => void;
}): ReactElement | null {
  if (passages.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 pt-2">
      {passages.map((p) => (
        <li
          key={p.passageId}
          data-testid="war-passage"
          className="flex items-center gap-1.5 rounded-sm border border-[#5c4526] bg-[#15100b] px-2 py-1 text-xs"
        >
          <Tooltip content={p.message === '' ? 'Ohlášený průchod' : p.message}>
            <span tabIndex={0} className="min-w-0 flex-1 truncate">
              {p.name} – {formatGameDate(dateOfDayIndex(p.etaDay))}
            </span>
          </Tooltip>
          <Tooltip content="Vzít na vědomí">
            <button
              type="button"
              aria-label="Vzít na vědomí"
              data-testid="war-passage-trust"
              className="hud-icon-button flex h-6 w-6 items-center justify-center"
              onClick={() => onAnswer(p.passageId, true)}
            >
              <img src={`${ICON}/handshake.svg`} alt="" width={14} height={14} draggable={false} />
            </button>
          </Tooltip>
          <Tooltip content="Nevěřit">
            <button
              type="button"
              aria-label="Nevěřit"
              data-testid="war-passage-distrust"
              className="hud-icon-button flex h-6 w-6 items-center justify-center"
              onClick={() => onAnswer(p.passageId, false)}
            >
              <img
                src={`${ICON}/seal-broken.svg`}
                alt=""
                width={14}
                height={14}
                draggable={false}
              />
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

export function WarPanel({
  view,
  error = null,
  onClose,
  onOfferPeace,
  onSummon,
  passages = [],
  onAnswerPassage,
  ownVillages = [],
  protection = null,
  onRequestProtection,
  onSendProtection,
  onRecallProtection,
  onAnnouncePassage,
}: {
  /** Ochrana vojskem (null – načítá se nebo není k dispozici). */
  protection?: ProtectionView | null;
  onRequestProtection?: (vassalageId: string) => Promise<ActionResult>;
  onSendProtection?: (vassalageId: string, villageId: string, men: number) => Promise<ActionResult>;
  onRecallProtection?: (vassalageId: string, villageId: string) => Promise<ActionResult>;
  onAnnouncePassage?: (warId: string, house: string, message: string) => Promise<ActionResult>;
  view: HouseView | null;
  /** Vlastní vsi hráče (výběr vsí k postoupení v míru). */
  ownVillages?: readonly CedeVillage[];
  error?: string | null;
  onClose: () => void;
  onOfferPeace?: (to: string, items: TermItem[], message: string | null) => void;
  /** Svolá vazaly do zobrazené vsi (vassalage.md – Svolání). */
  onSummon?: (warId: string, vassalageIds: string[]) => Promise<ActionResult>;
  /** Ohlášení průchodu, na která hráč může odpovědět. */
  passages?: readonly PassageView[];
  onAnswerPassage?: (passageId: string, trust: boolean) => void;
}): ReactElement {
  const [offering, setOffering] = useState<string | null>(null);
  const [summoning, setSummoning] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const wars = view?.wars ?? [];
  return (
    <div
      role="dialog"
      aria-label="Válka"
      data-testid="war-panel"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      <div className="flex items-center gap-1.5 pb-2">
        <Tooltip content="Válka">
          <img src={`${ICON}/spears.svg`} alt="" width={24} height={24} draggable={false} />
        </Tooltip>
        <Tooltip content="Zavřít">
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="war-close"
            className="hud-icon-button ml-auto flex h-6 w-6 items-center justify-center"
            onClick={onClose}
          >
            <img src={`${ICON}/cross.svg`} alt="" width={12} height={12} draggable={false} />
          </button>
        </Tooltip>
      </div>
      {!view ? (
        <div className="py-2 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : wars.length === 0 ? (
        <p data-testid="war-none" className="text-sm opacity-70">
          Nevedeš žádnou válku.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {wars.map((war) => (
            <li
              key={war.warId}
              data-testid="war-row"
              data-house-id={war.other.houseId}
              className="flex flex-col rounded-sm border border-[#5c4526] bg-[#15100b] px-2 py-1 text-sm"
            >
              <span className="font-semibold">{war.other.lordName ?? 'Rod bez jména'}</span>
              <span className="text-xs opacity-80">
                Od {formatGameDate(dateOfDayIndex(war.startedDay))} –{' '}
                {war.how === 'declared' ? 'opověď' : 'přepadení bez opovědi'} – válčí se
              </span>
              {onSummon && view && (
                <>
                  <Tooltip content="Svolat vazaly">
                    <button
                      type="button"
                      data-testid="war-summon"
                      aria-label="Svolat vazaly"
                      className="hud-icon-button mt-1 flex h-6 w-6 items-center justify-center"
                      onClick={() => setSummoning(summoning === war.warId ? null : war.warId)}
                    >
                      <img
                        src={`${ICON}/horn.svg`}
                        alt=""
                        width={16}
                        height={16}
                        draggable={false}
                      />
                    </button>
                  </Tooltip>
                  {summoning === war.warId && (
                    <SummonList view={view} warId={war.warId} onSummon={onSummon} />
                  )}
                </>
              )}
              {onAnnouncePassage && view && (
                <>
                  <Tooltip content="Ohlásit průchod">
                    <button
                      type="button"
                      data-testid="war-passage-open"
                      aria-label="Ohlásit průchod"
                      className="hud-icon-button mt-1 flex h-6 w-6 items-center justify-center"
                      onClick={() => setAnnouncing(announcing === war.warId ? null : war.warId)}
                    >
                      <Icon src={`${ICON}/passage.svg`} size={16} />
                    </button>
                  </Tooltip>
                  {announcing === war.warId && (
                    <PassageAnnounce
                      warId={war.warId}
                      houses={[...view.lords, ...view.vassals, ...view.others].filter(
                        (h, i, all) =>
                          h.houseId !== war.other.houseId &&
                          all.findIndex((x) => x.houseId === h.houseId) === i,
                      )}
                      onAnnounce={onAnnouncePassage}
                    />
                  )}
                </>
              )}
              {onOfferPeace && (
                <>
                  <Tooltip content="Nabídnout mír">
                    <button
                      type="button"
                      data-testid="war-offer-peace"
                      aria-label="Nabídnout mír"
                      className="hud-icon-button mt-1 flex h-6 w-6 items-center justify-center"
                      onClick={() =>
                        setOffering(offering === war.other.houseId ? null : war.other.houseId)
                      }
                    >
                      <img
                        src={`${ICON}/seal.svg`}
                        alt=""
                        width={16}
                        height={16}
                        draggable={false}
                      />
                    </button>
                  </Tooltip>
                  {offering === war.other.houseId && view && (
                    <PeaceForm
                      ownHouseId={view.ownHouseId}
                      otherId={war.other.houseId}
                      ownVillages={ownVillages}
                      otherVillages={war.otherVillages}
                      onSubmit={(items) => {
                        onOfferPeace(war.other.houseId, items, null);
                        setOffering(null);
                      }}
                    />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {onAnswerPassage && <PassageRows passages={passages} onAnswer={onAnswerPassage} />}
      {protection &&
        onRequestProtection &&
        onSendProtection &&
        onRecallProtection &&
        (protection.lords.length > 0 ||
          protection.vassalVillages.length > 0 ||
          protection.guards > 0) && (
          <ProtectionRows
            protection={protection}
            onRequest={onRequestProtection}
            onSend={onSendProtection}
            onRecall={onRecallProtection}
          />
        )}
      {error && (
        <p data-testid="war-error" role="alert" className="pt-1 text-xs text-[#e0a090]">
          {error}
        </p>
      )}
    </div>
  );
}
