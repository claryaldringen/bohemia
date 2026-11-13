'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useArmyActions } from '@/hooks/use-army';
import type {
  ArmyPanelData,
  CampaignEstimate,
  CampaignPlan,
  SurrenderOrder,
} from '@/lib/army-view';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import type { CampaignSummary } from '@/lib/campaign-view';
import { CampaignMap } from './CampaignMap';
import { KnownMapEye, useKnownMapList } from './KnownMapEye';
import { Tooltip } from './Tooltip';

// Panel Vojsko ve dvorci (war.md – Co hráč vidí; Martin 2. 11. 2026: „Tohle by mělo být textové,
// bez mapy“ – výjimka z pravidla „bez popisků“): cíl, velitel a zástupce, muži rodu a vesničané po
// vsích (dobrovolníci a nucení), shromaždiště, rozkaz ke vzdaným, jídlo, odhad síly a cesty
// a tlačítko Vyslat. Server je jediná autorita – panel jen posílá plán a ukazuje odhad.

const SURRENDER_NAMES: Record<SurrenderOrder, string> = {
  kill: 'Pobít',
  lead: 'Odvést',
  leave: 'Nechat',
};

const keyOf = (villageId: string, personId: number): string => `${villageId}:${personId}`;

function refOf(key: string): { villageId: string; personId: number } | null {
  const at = key.lastIndexOf(':');
  if (at < 0) return null;
  const personId = Number(key.slice(at + 1));
  return Number.isInteger(personId) ? { villageId: key.slice(0, at), personId } : null;
}

const toCount = (value: string, max: number): number =>
  Math.max(0, Math.min(max, Math.floor(Number(value)) || 0));

export function ArmyPanel({
  villageId,
  onClose,
}: {
  /** Ves, ve které hráč jedná (právo `war`) – výchozí shromaždiště. */
  villageId: string;
  onClose: () => void;
}): ReactElement {
  useKnownMapList();
  const [targetId, setTargetId] = useState('');
  const [data, setData] = useState<ArmyPanelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commanderKey, setCommanderKey] = useState('');
  const [deputyKey, setDeputyKey] = useState('');
  const [assembly, setAssembly] = useState(villageId);
  const [line, setLine] = useState<ReadonlySet<string>>(new Set());
  const [volunteers, setVolunteers] = useState<Record<string, string>>({});
  const [forced, setForced] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<'together' | 'by-village'>('together');
  const [surrendered, setSurrendered] = useState<SurrenderOrder>('lead');
  const [food, setFood] = useState('');
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(0);
  const actions = useArmyActions();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);

  // běžící tažení hráče – klik otevře mapu tažení (živé vedení, Ú6.14)
  useEffect(() => {
    const load = actions?.campaigns;
    if (!load) return;
    let live = true;
    void load()
      .then((result) => {
        if (live && Array.isArray(result)) setCampaigns(result);
      })
      .catch((error: unknown) => console.error('Tažení se nepodařilo načíst.', error));
    return () => {
      live = false;
    };
  }, [actions]);

  useEffect(() => {
    if (!actions) return;
    let live = true;
    void actions
      .load({ villageId, targetVillageId: targetId === '' ? null : targetId })
      .then((result) => {
        if (!live) return;
        if ('error' in result) {
          setLoadError(result.error);
          return;
        }
        setLoadError(null);
        setData(result);
        // výchozí velitel: hráčův muž, když může jít
        setCommanderKey((current) => {
          if (current !== '' || !result.lord) return current;
          const home = result.villages.find((v) => v.id === result.lord?.villageId);
          const fit = home?.lineMen.some((m) => m.personId === result.lord?.personId);
          return fit ? keyOf(result.lord.villageId, result.lord.personId) : current;
        });
      })
      .catch((error: unknown) => console.error('Panel Vojsko selhal.', error));
    return () => {
      live = false;
    };
  }, [villageId, targetId, actions]);

  /** Plán z výběru v panelu; null, dokud chybí cíl nebo velitel. */
  const plan = useMemo((): CampaignPlan | null => {
    const commander = refOf(commanderKey);
    if (!data || targetId === '' || !commander) return null;
    const deputy = deputyKey === '' ? null : refOf(deputyKey);
    const entries: CampaignPlan['villages'] = [];
    for (const village of data.villages) {
      const lineMen = village.lineMen
        .filter(
          (m) =>
            line.has(keyOf(village.id, m.personId)) ||
            keyOf(village.id, m.personId) === commanderKey ||
            keyOf(village.id, m.personId) === deputyKey,
        )
        .map((m) => m.personId);
      const volunteered = village.volunteers.slice(
        0,
        toCount(volunteers[village.id] ?? '', village.volunteers.length),
      );
      const ordered = village.others.slice(
        0,
        toCount(forced[village.id] ?? '', village.others.length),
      );
      if (lineMen.length + volunteered.length + ordered.length === 0) continue;
      entries.push({
        villageId: village.id,
        lineMen,
        villagers: volunteered,
        forced: ordered,
      });
    }
    if (entries.length === 0) return null;
    const men = entries.reduce(
      (n, e) => n + e.lineMen.length + e.villagers.length + e.forced.length,
      0,
    );
    const stores = data.villages.find((v) => v.id === assembly)?.storesKg ?? 0;
    const wanted = food === '' ? Math.min(stores, men * 25) : Math.floor(Number(food) || 0);
    return {
      commander,
      deputy,
      villages: entries,
      assemblyVillageId: assembly,
      targetVillageId: targetId,
      groups,
      surrendered,
      food: Math.max(0, wanted),
    };
  }, [
    data,
    targetId,
    commanderKey,
    deputyKey,
    line,
    volunteers,
    forced,
    assembly,
    groups,
    surrendered,
    food,
  ]);

  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (!plan) {
      setEstimate(null);
      setReason(null);
      return;
    }
    if (!actions) return;
    const ticket = ++asked.current;
    void actions
      .plan(plan)
      .then((result) => {
        if (ticket !== asked.current) return;
        if ('error' in result) {
          setEstimate(null);
          setReason(result.error);
        } else {
          setEstimate(result);
          setReason(null);
        }
      })
      .catch((error: unknown) => console.error('Odhad tažení selhal.', error));
    // plán se posílá, jen když se změnil jeho obsah
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const launch = (): void => {
    if (!plan || busy || !actions) return;
    setBusy(true);
    void actions
      .launch(plan)
      .then((result) => {
        if ('error' in result) setReason(result.error);
        else onClose();
      })
      .finally(() => setBusy(false));
  };

  const toggleLine = (key: string): void =>
    setLine((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (openCampaign !== null && actions?.campaign) {
    return (
      <CampaignMap
        campaignId={openCampaign}
        actions={actions.campaign}
        onClose={() => setOpenCampaign(null)}
      />
    );
  }
  const campaignRow =
    campaigns.length > 0 && actions?.campaign ? (
      <div className="flex flex-wrap gap-1">
        {campaigns.map((c) => (
          <Tooltip key={c.id} content={c.targetName ?? '…'}>
            <button
              type="button"
              data-testid="army-campaign"
              data-leads={c.leads ? 'true' : 'false'}
              aria-label={c.targetName ?? 'Tažení'}
              onClick={() => setOpenCampaign(c.id)}
              className="hud-inset rounded px-1.5"
            >
              ⚔
            </button>
          </Tooltip>
        ))}
      </div>
    ) : null;
  if (loadError) {
    return (
      <div
        data-testid="army-panel"
        className="hud-panel hud-popup p-2 text-xs text-red-400"
        data-hud-block
      >
        {loadError}
      </div>
    );
  }
  if (!data) {
    return (
      <div data-testid="army-panel" className="hud-panel hud-popup p-2 text-xs" data-hud-block>
        Vojsko…
      </div>
    );
  }
  const allLine = data.villages.flatMap((v) =>
    v.lineMen.map((m) => ({ key: keyOf(v.id, m.personId), village: v.name, man: m })),
  );
  const field = 'hud-inset rounded px-1 text-xs';
  return (
    <div
      data-testid="army-panel"
      className="hud-panel hud-popup flex max-h-[70vh] w-[22rem] flex-col gap-2 overflow-y-auto p-2 text-xs"
      data-hud-block
    >
      {campaignRow}
      <div className="flex items-center justify-between gap-2">
        <label className="flex flex-1 items-center justify-between gap-2">
          Cíl
          <select
            data-testid="army-target"
            className={field}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">– vyber ves ve válce –</option>
            {data.targets.map((t) => (
              <option key={t.villageId} value={t.villageId}>
                {t.name}
                {t.lordName ? ` (${t.lordName})` : ''}
              </option>
            ))}
          </select>
        </label>
        <KnownMapEye
          houseId={data.targets.find((t) => t.villageId === targetId)?.houseId ?? null}
          testId="army-known-map"
        />
      </div>
      <label className="flex items-center justify-between gap-2">
        Velitel
        <select
          data-testid="army-commander"
          className={field}
          value={commanderKey}
          onChange={(e) => setCommanderKey(e.target.value)}
        >
          <option value="">– vyber muže rodu –</option>
          {allLine.map(({ key, village, man }) => (
            <option key={key} value={key}>
              {(man.name ?? 'Muž rodu') + `, ${man.age} let, ${village}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Zástupce
        <select
          data-testid="army-deputy"
          className={field}
          value={deputyKey}
          onChange={(e) => setDeputyKey(e.target.value)}
        >
          <option value="">– žádný –</option>
          {allLine
            .filter((l) => l.key !== commanderKey)
            .map(({ key, village, man }) => (
              <option key={key} value={key}>
                {(man.name ?? 'Muž rodu') + `, ${man.age} let, ${village}`}
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Shromaždiště
        <select
          data-testid="army-assembly"
          className={field}
          value={assembly}
          onChange={(e) => setAssembly(e.target.value)}
        >
          {data.villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {data.villages.map((village) => (
        <fieldset
          key={village.id}
          data-testid={`army-village-${village.id}`}
          className="hud-inset flex flex-col gap-1 rounded p-1"
        >
          <legend className="px-1 font-semibold">{village.name}</legend>
          {village.lineMen.map((m) => {
            const key = keyOf(village.id, m.personId);
            const locked = key === commanderKey || key === deputyKey;
            return (
              <label key={key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid={`army-line-${village.id}-${m.personId}`}
                  checked={locked || line.has(key)}
                  disabled={locked}
                  onChange={() => toggleLine(key)}
                />
                {(m.name ?? 'Muž rodu') + `, ${m.age} let`}
                {m.mounted ? ', na koni' : ''}
              </label>
            );
          })}
          <div className="flex items-center justify-between gap-2">
            <span>
              Dobrovolníci{' '}
              {targetId === ''
                ? `(způsobilých ${formatInteger(village.candidates)})`
                : `(přihlášeno ${formatInteger(village.volunteers.length)})`}
            </span>
            <input
              type="number"
              min={0}
              max={village.volunteers.length}
              data-testid={`army-volunteers-${village.id}`}
              className={`${field} w-14`}
              value={volunteers[village.id] ?? ''}
              disabled={targetId === ''}
              onChange={(e) => setVolunteers((p) => ({ ...p, [village.id]: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>
              Nucení (ochotných {formatInteger(village.willing)}, neochotných{' '}
              {formatInteger(village.unwilling)})
            </span>
            <input
              type="number"
              min={0}
              max={village.others.length}
              data-testid={`army-forced-${village.id}`}
              className={`${field} w-14`}
              value={forced[village.id] ?? ''}
              disabled={targetId === ''}
              onChange={(e) => setForced((p) => ({ ...p, [village.id]: e.target.value }))}
            />
          </div>
        </fieldset>
      ))}
      <label className="flex items-center justify-between gap-2">
        Skupiny
        <select
          data-testid="army-groups"
          className={field}
          value={groups}
          onChange={(e) => setGroups(e.target.value === 'by-village' ? 'by-village' : 'together')}
        >
          <option value="together">Jedna</option>
          <option value="by-village">Podle vsí</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Zajatí a vzdaní
        <select
          data-testid="army-surrendered"
          className={field}
          value={surrendered}
          onChange={(e) => setSurrendered(e.target.value as SurrenderOrder)}
        >
          {(Object.keys(SURRENDER_NAMES) as SurrenderOrder[]).map((k) => (
            <option key={k} value={k}>
              {SURRENDER_NAMES[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Jídlo (kg obilí)
        <input
          type="number"
          min={0}
          data-testid="army-food"
          className={`${field} w-20`}
          value={food === '' ? (plan ? plan.food : '') : food}
          onChange={(e) => setFood(e.target.value)}
        />
      </label>
      {estimate && (
        <div data-testid="army-estimate" className="flex flex-col gap-0.5">
          <span>
            Síla vojska {formatDecimal(estimate.strength, 1)}, mužů {estimate.men.total} (rodu{' '}
            {estimate.men.line}, dobrovolníků {estimate.men.volunteers}, nucených{' '}
            {estimate.men.forced})
          </span>
          <span>
            Cesta ≈ {formatDecimal(estimate.travelDays, 1)} dne, jídlo na{' '}
            {formatDecimal(estimate.foodDays, 1)} dne
            {estimate.supplies.enough ? '' : ' (nosnost nestačí na cestu tam a zpět)'}
          </span>
          {estimate.ambush && (
            <span className="text-[#f3cf86]">Mezi rody není válka – útok ji rozpoutá.</span>
          )}
          <span>
            {estimate.liveCommand ? 'Velíš sám.' : 'Velí jiný muž – tažení řídí podle rozkazu.'}
          </span>
        </div>
      )}
      {reason && (
        <span data-testid="army-reason" className="font-semibold text-red-400">
          {reason}
        </span>
      )}
      <button
        type="button"
        data-testid="army-launch"
        disabled={!plan || estimate === null || busy}
        onClick={launch}
        className="hud-inset rounded px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
      >
        Vyslat
      </button>
    </div>
  );
}
