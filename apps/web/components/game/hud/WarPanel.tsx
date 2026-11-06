'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { dateOfDayIndex, type TermItem } from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import type { HouseView } from '@/lib/house-view';
import { cedeBlockReason, type CedeVillage } from '@/lib/peace-cede';
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
export function WarPanel({
  view,
  error = null,
  onClose,
  onOfferPeace,
  ownVillages = [],
}: {
  view: HouseView | null;
  /** Vlastní vsi hráče (výběr vsí k postoupení v míru). */
  ownVillages?: readonly CedeVillage[];
  error?: string | null;
  onClose: () => void;
  onOfferPeace?: (to: string, items: TermItem[], message: string | null) => void;
}): ReactElement {
  const [offering, setOffering] = useState<string | null>(null);
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
      {error && (
        <p data-testid="war-error" role="alert" className="pt-1 text-xs text-[#e0a090]">
          {error}
        </p>
      )}
    </div>
  );
}
