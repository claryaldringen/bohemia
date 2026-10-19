import { useState, type ReactElement } from 'react';
import type { Direction8, TradeGood, TradeGoods } from '@bohemia/game';
import type { VillageNeighbour } from '@/lib/manor-view';
import { DIRECTION_NAMES, TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { tradePreview } from '@/lib/trade-quote';
import { formatInteger } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

// Panel obchodu ve dvorci (trade.md – Obchod, Co hráč vidí): soused (jméno, směr), ikony zboží –
// co ves dá (soused shání) a co dostane (soused nabízí), posuvníky, bilance hodnoty pro souseda
// (musí být ≥ 0), cena v práci a dny cesty. Potvrdit → výprava vyrazí; na cestě jen průběh.

/** Ikona zboží s množstvím (kg nebo kusy) a názvem v popisku. */
function Good({ good, amount }: { good: TradeGood; amount: number }): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        {formatInteger(amount)}
        {unit === 'kg' ? ' kg' : ''}
      </span>
    </Tooltip>
  );
}

/** Řádek zboží s posuvníkem 0–max (celé kg / kusy) a cenou za kus v popisku. */
function GoodSlider({
  side,
  good,
  value,
  max,
  price,
  onChange,
}: {
  side: 'give' | 'get';
  good: TradeGood;
  value: number;
  max: number;
  price: number;
  onChange: (value: number) => void;
}): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <label className="flex items-center gap-1.5" data-testid={`trade-${side}-${good}`}>
      <Tooltip
        placement="above"
        content={
          <span className="flex flex-col gap-0.5">
            <span>{name}</span>
            <span className="flex items-center gap-1 tabular-nums">
              <img src="/icons/resources/food.png" alt="" width={16} height={16} />
              {price.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} / {unit}
            </span>
          </span>
        }
      >
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={24}
          height={24}
          tabIndex={0}
          className="shrink-0"
        />
      </Tooltip>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(value, max)}
        disabled={max <= 0}
        aria-label={name}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-[#d8b25c] disabled:opacity-40"
      />
      <span className="min-w-16 text-right text-xs whitespace-nowrap tabular-nums">
        {formatInteger(Math.min(value, max))}/{formatInteger(max)}
      </span>
    </label>
  );
}

/** Obchod s jedním sousedem – výběr zboží, náhled a potvrzení. */
export function NeighbourTrade({
  neighbour,
  busy = false,
  onSend,
  initial,
}: {
  neighbour: VillageNeighbour;
  busy?: boolean;
  onSend?: (give: TradeGoods, get: TradeGoods) => void;
  /** Počáteční výběr (testy). */
  initial?: { give: TradeGoods; get: TradeGoods };
}): ReactElement {
  const [give, setGive] = useState<TradeGoods>(initial?.give ?? {});
  const [get, setGet] = useState<TradeGoods>(initial?.get ?? {});
  if (neighbour.expedition) {
    const e = neighbour.expedition;
    const percent = Math.round(e.progress * 100);
    return (
      <div data-testid="trade-expedition" className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.entries(e.give) as [TradeGood, number][]).map(([g, n]) => (
            <Good key={`g-${g}`} good={g} amount={n} />
          ))}
          <span aria-hidden>⇄</span>
          {(Object.entries(e.get) as [TradeGood, number][]).map(([g, n]) => (
            <Good key={`r-${g}`} good={g} amount={n} />
          ))}
        </div>
        <Tooltip content={`Výprava ${percent} %`} placement="above">
          <span
            role="progressbar"
            aria-label="Výprava"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="hud-bar block h-2.5 w-56"
            tabIndex={0}
          >
            <span style={{ width: `${percent}%` }} />
          </span>
        </Tooltip>
      </div>
    );
  }
  const preview = tradePreview(neighbour, give, get);
  const fair = preview.balance >= 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4">
        <div className="flex flex-col gap-1" aria-label="Dáš" role="group">
          {neighbour.demands.map((row) => (
            <GoodSlider
              key={row.good}
              side="give"
              good={row.good}
              value={give[row.good] ?? 0}
              max={Math.min(row.left, row.have)}
              price={row.price}
              onChange={(v) => setGive({ ...give, [row.good]: v })}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1" aria-label="Dostaneš" role="group">
          {neighbour.offers.map((row) => (
            <GoodSlider
              key={row.good}
              side="get"
              good={row.good}
              value={get[row.good] ?? 0}
              max={row.left}
              price={row.price}
              onChange={(v) => setGet({ ...get, [row.good]: v })}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm whitespace-nowrap tabular-nums">
        <Tooltip content="Bilance pro souseda (kg obilí)" placement="above">
          <span
            data-testid="trade-balance"
            data-fair={fair}
            tabIndex={0}
            className={`flex items-center gap-1 font-semibold ${fair ? 'text-[#a8d46f]' : 'text-red-400'}`}
          >
            <img src="/icons/resources/food.png" alt="" width={18} height={18} />
            {preview.balance > 0 ? '+' : ''}
            {formatInteger(preview.balance)}
          </span>
        </Tooltip>
        <Tooltip content="Nosiči" placement="above">
          <span data-testid="trade-porters" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/people.png" alt="" width={18} height={18} />
            {preview.porters}
          </span>
        </Tooltip>
        <Tooltip content="Dny cesty tam a zpět" placement="above">
          <span data-testid="trade-days" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/date.png" alt="" width={18} height={18} />
            {preview.days}
          </span>
        </Tooltip>
        <Tooltip content="Práce (člověkodny)" placement="above">
          <span data-testid="trade-labor" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/labor.png" alt="" width={18} height={18} />
            {preview.manDays}
          </span>
        </Tooltip>
        <Tooltip
          placement="above"
          content={
            <span className="flex flex-col gap-0.5">
              <span>Vyslat výpravu</span>
              {preview.blocked && (
                <span data-testid="trade-blocked" className="font-semibold text-red-400">
                  {preview.blocked}
                </span>
              )}
            </span>
          }
        >
          <button
            type="button"
            data-testid="trade-send"
            aria-label="Vyslat výpravu"
            disabled={preview.blocked !== null || busy || !onSend}
            aria-busy={busy}
            onClick={() => onSend?.(give, get)}
            className="hud-inset h-9 w-9 overflow-hidden rounded disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
          >
            <img
              src="/icons/build/obchod.png"
              alt=""
              width={36}
              height={36}
              className="h-full w-full"
            />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Panel obchodu: sousedé po hotových stezkách (šipka směru a jméno vsi), pod nimi obchod
 * s vybraným. `onSend` – výprava vyrazí (server action), panel se pak zavře.
 */
export function TradePanel({
  neighbours,
  onSend,
  onClose,
  initialDirection,
}: {
  neighbours: readonly VillageNeighbour[];
  onSend?: (direction: Direction8, give: TradeGoods, get: TradeGoods) => Promise<void>;
  onClose?: () => void;
  initialDirection?: Direction8;
}): ReactElement {
  const [selected, setSelected] = useState<Direction8 | null>(
    initialDirection ?? neighbours[0]?.direction ?? null,
  );
  const [busy, setBusy] = useState(false);
  const neighbour = neighbours.find((n) => n.direction === selected) ?? neighbours[0] ?? null;
  const send = (give: TradeGoods, get: TradeGoods): void => {
    if (!onSend || !neighbour || busy) return;
    setBusy(true);
    void onSend(neighbour.direction, give, get).finally(() => {
      setBusy(false);
      onClose?.();
    });
  };
  return (
    <div data-testid="trade-panel" className="flex min-w-[26rem] flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sousedé">
        {neighbours.map((n) => (
          <button
            key={n.direction}
            type="button"
            role="tab"
            aria-selected={n.direction === neighbour?.direction}
            data-testid={`neighbour-${n.direction}`}
            onClick={() => setSelected(n.direction)}
            className={`hud-button px-2 py-0.5 text-sm whitespace-nowrap ${n.direction === neighbour?.direction ? 'ring-1 ring-[#c9a14a]' : ''}`}
          >
            <span aria-hidden className="mr-1">
              {DIRECTION_NAMES[n.direction].arrow}
            </span>
            {n.name}
          </button>
        ))}
      </div>
      {neighbour && (
        <NeighbourTrade
          key={neighbour.direction}
          neighbour={neighbour}
          busy={busy}
          {...(onSend ? { onSend: send } : {})}
        />
      )}
    </div>
  );
}
