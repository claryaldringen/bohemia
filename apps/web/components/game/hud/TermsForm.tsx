'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  NEGOTIATION,
  type AidLine,
  type MacroBundle,
  type MacroGoods,
  type MacroSpare,
  type TermItem,
  type TermLine,
  type TradeLine,
} from '@bohemia/game';
import { termRowLabel, type TermRowView } from '@/lib/negotiation-view';
import {
  AID_ICONS,
  BUNDLE_SLOTS,
  GOODS_SLOTS,
  aidChips,
  bundleValue,
  emptyBundle,
  formatAmount,
  lineChips,
  serviceLabel,
  tradeChips,
  withBundleValue,
  type TermChip,
  type TermIcon,
} from '@/lib/terms-view';
import { Tooltip } from './Tooltip';

// Formulář podmínek jednání (vassalage.md – Co hráč vidí): řádky podmínek jako ikony s čísly
// (obilí s kg, kláda s počtem, meč s muži × dny, ves s klíčem), u dávek výhled „kolik můžu
// postrádat“ šedým číslem; vzkaz je textové pole (výjimka z pravidla „bez popisků“ – vzkaz je
// text hráče) a tlačítka odeslat / zrušit.

const ICON = '/icons/house';

// Ikony rodu, které jsou zároveň ikonami zdrojů – vůz (obchod), obilí, klády a přesýpací hodiny
const RESOURCE_ICON: Readonly<Record<string, string>> = {
  cart: 'cart',
  grain: 'food',
  log: 'wood',
  hourglass: 'hourglass',
};

/** Cesta k ikoně rodu (`public/icons/house/*.png` z Blenderu – tools/blender/icons.py). */
export function houseIconSrc(name: string): string {
  const resource = RESOURCE_ICON[name];
  return resource ? `/icons/resources/${resource}.png` : `${ICON}/${name}.png`;
}

export function HouseIcon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <img src={houseIconSrc(name)} alt="" width={size} height={size} draggable={false} />;
}

/** Ikona podmínky: ikona rodu, nebo ikona zdroje. */
export function TermIconImg({ icon, size = 20 }: { icon: TermIcon; size?: number }): ReactElement {
  const src = icon.set === 'house' ? houseIconSrc(icon.name) : `/icons/resources/${icon.name}.png`;
  return <img src={src} alt="" width={size} height={size} draggable={false} />;
}

/** Ikona s číslem a popiskem u kurzoru. */
export function Chip({ chip, size = 18 }: { chip: TermChip; size?: number }): ReactElement {
  return (
    <Tooltip content={chip.label}>
      <span
        tabIndex={0}
        aria-label={chip.label}
        data-testid="term-chip"
        data-chip={chip.key}
        className={`inline-flex items-center gap-0.5 ${chip.reward ? 'opacity-70' : ''}`}
      >
        <TermIconImg icon={chip.icon} size={size} />
        {chip.text !== '' && <span className="text-xs tabular-nums">{chip.text}</span>}
      </span>
    </Tooltip>
  );
}

/** Co o dohodě ví formulář: čí je rod, které vsi smí vybrat a odkud vzít výhled. */
export interface TermsContext {
  /** Hráčův rod je pánem dohody (jemu patří cílová ves, odměnu platí on). */
  lordIsOwn: boolean;
  /** Hráčův rod (u obchodu klíč jeho vsi odeslání v `fromVillage`). */
  ownHouseId?: string;
  /** Vsi hráče (cílová ves pána). */
  villages: readonly { id: string; name: string }[];
  /** Herní rok (výchozí rok první splátky půjčky). */
  gameYear?: number;
  /** Výhled „kolik můžu postrádat“ (jen na vyžádání); null = nedostupný. */
  loadSpare?: (targetVillageId: string | null) => Promise<MacroSpare | null>;
  /** Opověď války: id napadeného rodu – formulář nabídne požadavek vazalství a smí být prázdný. */
  demandFor?: string;
  /**
   * Zajatci k výkupnému (war.md – Vzdaní, zajetí a výkupné): zajatci, které hráč drží – formulář
   * pak nabídne řádek výkupného. Zda patří rodu protistrany, ověří server (`ransom.check`).
   */
  captives?: readonly { id: string; name: string | null; noble: boolean; houseId?: string }[];
}

/** Platí tuhle podmínku hráčův rod? (dávku vazal, odměnu pán) */
function ownPays(kind: TermItem['kind'], lordIsOwn: boolean): boolean {
  return kind === 'tribute' ? !lordIsOwn : kind === 'reward' ? lordIsOwn : false;
}

/** Řádek podmínek: `label` je popisek, `onChange` chybí u řádku jen ke čtení (karta jednání). */
export interface TermRowProps {
  item: TermItem;
  label: string;
  onChange?: (item: TermItem) => void;
  context?: TermsContext;
  /** Výhled pro dávku / odměnu, kterou platí hráč; jinak null. */
  spare?: MacroSpare | null;
}
export type TermRowComponent = (props: TermRowProps) => ReactElement;

/** Přísaha: pečeť; role (kdo je pán) se v protinávrhu nemění, proto se zatím neupravuje. */
function OathRow({ label }: TermRowProps): ReactElement {
  return (
    <Tooltip content={label}>
      <span
        tabIndex={0}
        aria-label={label}
        data-testid="term-row-oath"
        className="inline-flex items-center"
      >
        <HouseIcon name="seal" size={26} />
      </span>
    </Tooltip>
  );
}

/** Celé nezáporné číslo z políčka (kg smí mít jen celá čísla také – kila jsou celá). */
const countOf = (text: string): number => Math.max(0, Math.floor(Number(text)) || 0);

function NumberInput({
  value,
  label,
  testId,
  onChange,
}: {
  value: number;
  label: string;
  testId: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <input
      type="number"
      min={0}
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(countOf(event.target.value))}
      className="w-16 rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs tabular-nums"
    />
  );
}

/** Dávka nebo odměna: ve formuláři políčka svazku s výhledem, jinak ikony s čísly. */
function BundleRow({ item, label, onChange, context, spare }: TermRowProps): ReactElement {
  if (item.kind !== 'tribute' && item.kind !== 'reward') return <span />;
  const kind = item.kind;
  const bundle: MacroBundle = item.goods;
  if (!onChange) {
    return (
      <span
        data-testid={`term-row-${kind}`}
        className="inline-flex flex-wrap items-center gap-1.5"
        aria-label={label}
      >
        {lineChips(item).map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
      </span>
    );
  }
  const showSpare = spare != null && context !== undefined && ownPays(kind, context.lordIsOwn);
  return (
    <div data-testid={`term-row-${kind}`} className="flex flex-wrap items-start gap-1.5">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex pt-0.5 opacity-70">
          <HouseIcon name={kind === 'tribute' ? 'banner' : 'throne'} size={20} />
        </span>
      </Tooltip>
      {BUNDLE_SLOTS.map((slot) => {
        const value = bundleValue(bundle, slot.key);
        const room = showSpare ? bundleValue(spare, slot.key) : null;
        return (
          <label key={slot.key} className="flex flex-col items-start gap-0.5">
            <Tooltip content={slot.label}>
              <span className="inline-flex items-center gap-0.5">
                <TermIconImg icon={slot.icon} size={18} />
                <NumberInput
                  value={value}
                  label={slot.label}
                  testId={`term-${kind}-${slot.key}`}
                  onChange={(v) =>
                    onChange({ ...item, goods: withBundleValue(bundle, slot.key, v) })
                  }
                />
              </span>
            </Tooltip>
            {room !== null && (
              <span
                data-testid={`term-${kind}-${slot.key}-spare`}
                className="pl-5 text-[10px] text-[#8a7a60] tabular-nums"
              >
                {formatAmount(room)}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Vojenská služba: meč s muži × dny. */
function ServiceRow({ item, label, onChange }: TermRowProps): ReactElement {
  if (item.kind !== 'service') return <span />;
  if (!onChange) {
    const [chip] = lineChips(item);
    return (
      <span data-testid="term-row-service" aria-label={label}>
        {chip && <Chip chip={chip} />}
      </span>
    );
  }
  return (
    <div data-testid="term-row-service" className="flex items-center gap-1">
      <Tooltip content={`Vojenská služba: ${serviceLabel(item.men, item.days)}`}>
        <span tabIndex={0} aria-label={label} className="inline-flex">
          <HouseIcon name="sword" size={20} />
        </span>
      </Tooltip>
      <NumberInput
        value={item.men}
        label="Muži"
        testId="term-service-men"
        onChange={(men) => onChange({ ...item, men })}
      />
      <span className="text-xs">×</span>
      <NumberInput
        value={item.days}
        label="Dny"
        testId="term-service-days"
        onChange={(days) => onChange({ ...item, days })}
      />
    </div>
  );
}

/** Cílová ves pána: ves s klíčem; pán ji vybírá ze svých vsí. */
function TargetVillageRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'target-village') return <span />;
  const name = context?.villages.find((v) => v.id === item.villageId)?.name ?? null;
  const [chip] = lineChips(item, name);
  if (!onChange || !context?.lordIsOwn || context.villages.length === 0) {
    return (
      <span data-testid="term-row-target-village" aria-label={label}>
        {chip && <Chip chip={chip} />}
      </span>
    );
  }
  return (
    <div data-testid="term-row-target-village" className="flex items-center gap-1">
      <Tooltip content={chip?.label ?? label}>
        <span tabIndex={0} aria-label={chip?.label ?? label} className="inline-flex">
          <HouseIcon name="village-key" size={20} />
        </span>
      </Tooltip>
      <select
        aria-label="Ves"
        data-testid="term-target-village-select"
        value={item.villageId}
        onChange={(event) => onChange({ ...item, villageId: event.target.value })}
        className="rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs"
      >
        {context.villages.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Svěření správy vsi (vassalage.md – Hráč jako správce cizí vsi): ves s klíčem; pán ji vybírá ze
 * svých vsí, druhá strana ji jen vidí. Ve správě se k ní přidává odměna (řádek „Roční odměna“).
 */
function StewardshipRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'stewardship') return <span />;
  const name = context?.villages.find((v) => v.id === item.villageId)?.name ?? null;
  const text = name ? `${label}: ${name}` : label;
  const editable = onChange && context?.lordIsOwn && context.villages.length > 0;
  return (
    <div data-testid="term-row-stewardship" className="flex items-center gap-1">
      <Tooltip content={text}>
        <span tabIndex={0} aria-label={text} className="inline-flex">
          <HouseIcon name="village-key" size={20} />
        </span>
      </Tooltip>
      {editable ? (
        <select
          aria-label="Ves"
          data-testid="term-stewardship-select"
          value={item.villageId}
          onChange={(event) => onChange({ ...item, villageId: event.target.value })}
          className="rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs"
        >
          {context.villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      ) : (
        name && <span className="text-xs">{name}</span>
      )}
    </div>
  );
}

/** Zboží bez lidí a roboty z řádku svazku (splátka nese jen makrokomodity). */
function goodsOf(bundle: MacroBundle): MacroGoods {
  return {
    grainKg: bundle.grainKg,
    hayKg: bundle.hayKg,
    cattle: { ...bundle.cattle },
    horses: bundle.horses,
    logs: bundle.logs,
    stoneM3: bundle.stoneM3,
  };
}

/** Políčka zboží (obilí, seno, dobytek, koně, klády) s ikonami; `testPrefix` do testid. */
function GoodsInputs({
  goods,
  testPrefix,
  onChange,
}: {
  goods: MacroGoods;
  testPrefix: string;
  onChange: (goods: MacroGoods) => void;
}): ReactElement {
  const bundle: MacroBundle = {
    ...goods,
    people: { families: 0, men: 0, women: 0 },
    laborDays: 0,
  };
  return (
    <>
      {GOODS_SLOTS.map((slot) => (
        <Tooltip key={slot.key} content={slot.label}>
          <span className="inline-flex items-center gap-0.5">
            <TermIconImg icon={slot.icon} size={18} />
            <NumberInput
              value={bundleValue(bundle, slot.key)}
              label={slot.label}
              testId={`${testPrefix}-${slot.key}`}
              onChange={(v) => onChange(goodsOf(withBundleValue(bundle, slot.key, v)))}
            />
          </span>
        </Tooltip>
      ))}
    </>
  );
}

/** Výběr vsi hráče (odkud / kam pomoc jde). */
function VillageSelect({
  value,
  villages,
  testId,
  onChange,
}: {
  value: string | undefined;
  villages: readonly { id: string; name: string }[];
  testId: string;
  onChange: (id: string) => void;
}): ReactElement {
  return (
    <select
      aria-label="Ves"
      data-testid={testId}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs"
    >
      {villages.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Pomoc na žádost (vassalage.md – Pomoc na žádost): žádost vazala, dar a půjčka pána. Ve formuláři
 * políčka zboží a výběr vsi (vazal: kam, pán: odkud), u půjčky splátkový kalendář (rok + zboží);
 * jinak ikony s čísly.
 */
function AidRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'aid-request' && item.kind !== 'gift' && item.kind !== 'loan') return <span />;
  const aid: AidLine = item;
  if (!onChange) {
    return (
      <span
        data-testid={`term-row-${aid.kind}`}
        className="inline-flex flex-wrap items-center gap-1.5"
        aria-label={label}
      >
        <Tooltip content={label}>
          <span tabIndex={0} aria-label={label} className="inline-flex">
            <TermIconImg icon={AID_ICONS[aid.kind]} size={22} />
          </span>
        </Tooltip>
        {aidChips(aid).map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
      </span>
    );
  }
  const villages = context?.villages ?? [];
  const update = (patch: Partial<AidLine>): void => onChange({ ...aid, ...patch } as AidLine);
  return (
    <div data-testid={`term-row-${aid.kind}`} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip content={label}>
          <span tabIndex={0} aria-label={label} className="inline-flex">
            <TermIconImg icon={AID_ICONS[aid.kind]} size={22} />
          </span>
        </Tooltip>
        <GoodsInputs
          goods={goodsOf(aid.bundle)}
          testPrefix={`term-${aid.kind}`}
          onChange={(goods) =>
            update({ bundle: { ...aid.bundle, ...goods, cattle: goods.cattle } })
          }
        />
        {villages.length > 0 && (
          <VillageSelect
            value={aid.kind === 'aid-request' ? aid.villageId : aid.fromVillageId}
            villages={villages}
            testId={`term-${aid.kind}-village`}
            onChange={(id) =>
              update(aid.kind === 'aid-request' ? { villageId: id } : { fromVillageId: id })
            }
          />
        )}
      </div>
      {aid.kind === 'loan' && (
        <div data-testid="term-loan-schedule" className="flex flex-col gap-1 pl-6">
          {aid.schedule.map((installment, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <Tooltip content="Rok splátky">
                <span className="inline-flex items-center gap-0.5">
                  <HouseIcon name="hourglass" size={16} />
                  <input
                    type="number"
                    aria-label="Rok splátky"
                    data-testid={`term-loan-year-${i}`}
                    value={installment.year}
                    onChange={(event) =>
                      update({
                        schedule: aid.schedule.map((x, j) =>
                          j === i ? { ...x, year: countOf(event.target.value) } : x,
                        ),
                      })
                    }
                    className="w-16 rounded-sm border border-[#5c4526] bg-[#15100b] px-1 text-xs tabular-nums"
                  />
                </span>
              </Tooltip>
              <GoodsInputs
                goods={installment.goods}
                testPrefix={`term-loan-${i}`}
                onChange={(goods) =>
                  update({
                    schedule: aid.schedule.map((x, j) => (j === i ? { ...x, goods } : x)),
                  })
                }
              />
              <Tooltip content="Odebrat splátku">
                <button
                  type="button"
                  aria-label="Odebrat splátku"
                  data-testid={`term-loan-remove-${i}`}
                  className="hud-icon-button flex h-5 w-5 items-center justify-center"
                  onClick={() => update({ schedule: aid.schedule.filter((_, j) => j !== i) })}
                >
                  <HouseIcon name="cross" size={12} />
                </button>
              </Tooltip>
            </div>
          ))}
          <Tooltip content="Přidat splátku">
            <button
              type="button"
              aria-label="Přidat splátku"
              data-testid="term-loan-add"
              className="hud-icon-button flex h-6 w-9 items-center justify-center"
              onClick={() =>
                update({
                  schedule: [
                    ...aid.schedule,
                    {
                      year: (aid.schedule.at(-1)?.year ?? context?.gameYear ?? 0) + 1,
                      goods: { ...goodsOf(emptyBundle()), grainKg: 100 },
                    },
                  ],
                })
              }
            >
              <TermIconImg icon={AID_ICONS.loan} size={16} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

/**
 * Obchod mezi hráči (vassalage.md – Hospodářství mezi hráči): dvě skupiny zboží s hlavičkami
 * „Dáš“ a „Dostaneš“ (výjimka z pravidla bez popisků – hlavičky v obchodu smí být slovy), ve
 * formuláři políčka zboží a výběr vsi, ze které hráč pošle; jinak ikony s čísly. Jen makrokomodity.
 */
function TradeRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'trade') return <span />;
  const trade: TradeLine = item;
  const chips = tradeChips(trade);
  if (!onChange) {
    return (
      <div data-testid="term-row-trade" aria-label={label} className="flex flex-col gap-1">
        {(
          [
            ['give', 'Dáš'],
            ['get', 'Dostaneš'],
          ] as const
        ).map(([side, title]) => (
          <div key={side} className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-xs opacity-70">{title}</span>
            {chips[side].map((chip) => (
              <Chip key={chip.key} chip={chip} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  const own = context?.ownHouseId;
  const villages = context?.villages ?? [];
  return (
    <div data-testid="term-row-trade" className="flex flex-col gap-1">
      {(
        [
          ['give', 'Dáš'],
          ['get', 'Dostaneš'],
        ] as const
      ).map(([side, title]) => (
        <div key={side} className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-xs">{title}</span>
          <GoodsInputs
            goods={goodsOf(trade[side])}
            testPrefix={`term-trade-${side}`}
            onChange={(goods) => onChange({ ...trade, [side]: { ...trade[side], ...goods } })}
          />
          {side === 'give' && own !== undefined && villages.length > 0 && (
            <VillageSelect
              value={trade.fromVillage[own] ?? villages[0]?.id}
              villages={villages}
              testId="term-trade-village"
              onChange={(id) =>
                onChange({ ...trade, fromVillage: { ...trade.fromVillage, [own]: id } })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Věnování dílu odúmrti (vassalage.md – Vymření rodu – odúmrť): počet vsí a vazalů dílu; řádek
 * vzniká z rozhodnutí o odúmrti (`EscheatDialog`), ve formuláři se jen zobrazí.
 */
function VillageGiftRow({ item, label }: TermRowProps): ReactElement {
  if (item.kind !== 'village-gift') return <span />;
  return (
    <div data-testid="term-row-village-gift" className="flex items-center gap-1">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex items-center gap-1">
          <HouseIcon name="village-key" size={20} />
          <span className="tabular-nums">{item.villageIds.length}</span>
          <HouseIcon name="oath" size={16} />
          <span className="tabular-nums">{item.vassalIds.length}</span>
        </span>
      </Tooltip>
    </div>
  );
}

/** Požadavek při opovědi války: zkřížené oštěpy a vnořené řádky podmínek míru (jen ke čtení). */
function WarDemandRow({ item, label, context }: TermRowProps): ReactElement {
  if (item.kind !== 'war-demand') return <span />;
  return (
    <div data-testid="term-row-war-demand" className="flex items-center gap-1">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex items-center gap-1">
          <HouseIcon name="spears" size={20} />
        </span>
      </Tooltip>
      {item.items.length > 0 && (
        <TermRows
          rows={item.items.map((i) => ({
            kind: i.kind,
            item: i,
            label: termRowLabel(i, context?.ownHouseId ?? '', { lordName: null }),
          }))}
          context={context}
        />
      )}
    </div>
  );
}

/** Podmínky míru (jen ke čtení): pečeť a vnořené řádky poplatku, tributu, vazalství, postoupení. */
function PeaceRow({ item, label }: TermRowProps): ReactElement {
  if (item.kind !== 'peace') return <span />;
  const parts: string[] = [];
  if (item.fee) parts.push(`poplatek ${Math.round(item.fee.grainKg)} kg obilí`);
  if (item.tribute) parts.push(`tribut ${Math.round(item.tribute.goods.grainKg)} kg obilí ročně`);
  if (item.vassalage) parts.push('vazalství');
  if (item.cede?.length) parts.push(`postoupení vsí: ${item.cede.length}`);
  return (
    <div data-testid="term-row-peace" className="flex items-center gap-1">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex items-center gap-1">
          <HouseIcon name="seal" size={20} />
        </span>
      </Tooltip>
      <span className="text-xs">{parts.length > 0 ? parts.join(', ') : 'mír bez podmínek'}</span>
    </div>
  );
}

/** Výkupné zajatců: zajatci, cena a případné vazalství; s `onChange` se dá sestavit ve formuláři. */
function RansomRow({ item, label, onChange, context }: TermRowProps): ReactElement {
  if (item.kind !== 'ransom') return <span />;
  if (!onChange) {
    const parts = [
      `zajatců ${item.prisonerIds.length}`,
      `${Math.round(item.price.grainKg)} kg obilí`,
    ];
    if (item.vassalage) parts.push('vazalství');
    return (
      <div data-testid="term-row-ransom" className="flex items-center gap-1">
        <Tooltip content={label}>
          <span tabIndex={0} aria-label={label} className="inline-flex items-center gap-1">
            <img src="/icons/war/captive.png" alt="" width={20} height={20} />
          </span>
        </Tooltip>
        <span className="text-xs">{parts.join(', ')}</span>
      </div>
    );
  }
  const captives = context?.captives ?? [];
  const toggle = (id: string): void =>
    onChange({
      ...item,
      prisonerIds: item.prisonerIds.includes(id)
        ? item.prisonerIds.filter((x) => x !== id)
        : [...item.prisonerIds, id],
    });
  return (
    <div data-testid="term-row-ransom" className="flex flex-wrap items-center gap-1.5">
      <Tooltip content={label}>
        <span tabIndex={0} aria-label={label} className="inline-flex">
          <img src="/icons/war/captive.png" alt="" width={22} height={22} />
        </span>
      </Tooltip>
      {captives.map((c) => {
        const chosen = item.prisonerIds.includes(c.id);
        const name = c.name ?? (c.noble ? 'Šlechtic' : 'Zajatec');
        return (
          <Tooltip key={c.id} content={name}>
            <button
              type="button"
              aria-label={name}
              aria-pressed={chosen}
              data-testid={`term-ransom-prisoner-${c.id}`}
              className={`hud-icon-button flex h-7 w-7 items-center justify-center ${chosen ? 'opacity-100' : 'opacity-40'}`}
              onClick={() => toggle(c.id)}
            >
              <img src="/icons/war/captive.png" alt="" width={18} height={18} />
            </button>
          </Tooltip>
        );
      })}
      <GoodsInputs
        goods={goodsOf(item.price)}
        testPrefix="term-ransom"
        onChange={(goods) => onChange({ ...item, price: { ...item.price, ...goods } })}
      />
    </div>
  );
}

/** Registr řádků podle druhu podmínky. */
export const TERM_ROWS: Record<TermItem['kind'], TermRowComponent> = {
  oath: OathRow,
  tribute: BundleRow,
  service: ServiceRow,
  'target-village': TargetVillageRow,
  reward: BundleRow,
  'aid-request': AidRow,
  gift: AidRow,
  loan: AidRow,
  trade: TradeRow,
  stewardship: StewardshipRow,
  'village-gift': VillageGiftRow,
  'war-demand': WarDemandRow,
  peace: PeaceRow,
  ransom: RansomRow,
};

/** Řádky podmínek (formulář i karta jednání); `onRemove` přidá křížek u řádků bez přísahy. */
export function TermRows({
  rows,
  onChange,
  onRemove,
  context,
  spare,
}: {
  rows: readonly TermRowView[];
  onChange?: (index: number, item: TermItem) => void;
  onRemove?: (index: number) => void;
  context?: TermsContext;
  spare?: MacroSpare | null;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const Row = TERM_ROWS[row.kind];
        return (
          <div key={i} className="flex items-start gap-1">
            <Row
              item={row.item}
              label={row.label}
              onChange={onChange ? (item) => onChange(i, item) : undefined}
              context={context}
              spare={spare}
            />
            {onRemove && row.kind !== 'oath' && (
              <Tooltip content="Odebrat řádek">
                <button
                  type="button"
                  aria-label="Odebrat řádek"
                  data-testid={`term-remove-${row.kind}`}
                  className="hud-icon-button flex h-5 w-5 shrink-0 items-center justify-center"
                  onClick={() => onRemove(i)}
                >
                  <HouseIcon name="cross" size={12} />
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ADDABLE: {
  kind: TermLine['kind'] | 'stewardship' | 'ransom';
  icon: string;
  label: string;
}[] = [
  { kind: 'tribute', icon: 'grain', label: 'Přidat roční dávku' },
  { kind: 'service', icon: 'sword', label: 'Přidat vojenskou službu' },
  { kind: 'target-village', icon: 'village-key', label: 'Přidat správu vsi' },
  { kind: 'reward', icon: 'log', label: 'Přidat roční odměnu' },
  { kind: 'stewardship', icon: 'village-key', label: 'Svěřit správu vsi' },
  { kind: 'ransom', icon: 'seal', label: 'Sjednat výkupné zajatců' },
];

/** Nový řádek podmínky s rozumnou výchozí hodnotou, nebo null, když ho nejde přidat. */
function newRow(
  kind: TermLine['kind'] | 'stewardship' | 'ransom',
  context?: TermsContext,
): TermItem | null {
  switch (kind) {
    case 'ransom':
      // výkupné je samostatný řádek a potřebuje zajatce k výběru
      return context?.captives?.length
        ? { kind, prisonerIds: [], price: { ...emptyBundle(), grainKg: 100 } }
        : null;
    case 'tribute':
    case 'reward':
      return { kind, goods: { ...emptyBundle(), grainKg: 100 } };
    case 'service':
      return { kind, men: 1, days: 30 };
    case 'stewardship':
    case 'target-village': {
      const first = context?.villages[0];
      return context?.lordIsOwn && first ? { kind, villageId: first.id } : null;
    }
  }
}

const isAid = (item: TermItem): item is AidLine =>
  item.kind === 'aid-request' || item.kind === 'gift' || item.kind === 'loan';

/** Odpověď pána na žádost (nebo přepnutí daru a půjčky): stejné zboží, kam žádal vazal. */
function asAnswer(kind: 'gift' | 'loan', from: AidLine, context?: TermsContext): AidLine {
  const fromVillageId =
    from.kind === 'aid-request' ? (context?.villages[0]?.id ?? '') : from.fromVillageId;
  const toVillageId = from.kind === 'aid-request' ? from.villageId : from.toVillageId;
  const target = toVillageId ? { toVillageId } : {};
  if (kind === 'gift') return { kind, bundle: from.bundle, fromVillageId, ...target };
  const schedule =
    from.kind === 'loan'
      ? from.schedule
      : [{ year: (context?.gameYear ?? 0) + 1, goods: goodsOf(from.bundle) }];
  return { kind, bundle: from.bundle, fromVillageId, ...target, schedule };
}

/**
 * Formulář podmínek: řádky, vzkaz a tlačítka. `submitLabel` a `submitIcon` popisují odeslání
 * („Nabídnout vazalství“ + pečeť, „Protinávrh“ + pero).
 */
export function TermsForm({
  rows: initial,
  submitLabel,
  submitIcon,
  busy,
  context,
  allowEmpty = false,
  onSubmit,
  onCancel,
}: {
  rows: readonly TermRowView[];
  submitLabel: string;
  submitIcon: string;
  busy: boolean;
  context?: TermsContext;
  /** Prázdný formulář smí odejít (holá opověď války). */
  allowEmpty?: boolean;
  onSubmit: (items: TermItem[], message: string | null) => void;
  onCancel: () => void;
}): ReactElement {
  const [rows, setRows] = useState<TermRowView[]>([...initial]);
  const [message, setMessage] = useState('');
  const [spare, setSpare] = useState<MacroSpare | null>(null);
  const tooLong = message.length > NEGOTIATION.messageMaxChars;
  const loadSpare = context?.loadSpare;
  const lordIsOwn = context?.lordIsOwn ?? false;
  const paysSomething = rows.some((r) => ownPays(r.kind, lordIsOwn));
  const target = rows.find((r) => r.item.kind === 'target-village')?.item;
  const targetId = target?.kind === 'target-village' ? target.villageId : null;
  // výhled „kolik můžu postrádat“ jen na vyžádání: při otevření formuláře s dávkou, kterou platím
  useEffect(() => {
    if (!loadSpare || !paysSomething) return;
    let current = true;
    void loadSpare(targetId).then((result) => {
      if (current) setSpare(result);
    });
    return () => {
      current = false;
    };
  }, [loadSpare, paysSomething, targetId]);
  const present = new Set(rows.map((r) => r.kind));
  const aidMode = rows.some((r) => isAid(r.item));
  const tradeMode = rows.some((r) => r.kind === 'trade');
  const ransomMode = rows.some((r) => r.kind === 'ransom');
  return (
    <div data-testid="terms-form" className="flex w-full flex-col gap-1.5">
      <TermRows
        rows={rows}
        context={context}
        spare={spare}
        onChange={(index, item) =>
          setRows((current) => current.map((r, i) => (i === index ? { ...r, item } : r)))
        }
        onRemove={
          aidMode || tradeMode
            ? undefined
            : (index) => setRows((current) => current.filter((_, i) => i !== index))
        }
      />
      {aidMode && lordIsOwn && (
        <div className="flex items-center gap-1.5">
          {(['gift', 'loan'] as const).map((kind) => (
            <Tooltip key={kind} content={kind === 'gift' ? 'Dát zdarma' : 'Půjčit se splátkami'}>
              <button
                type="button"
                aria-label={kind === 'gift' ? 'Dát zdarma' : 'Půjčit se splátkami'}
                data-testid={`terms-aid-${kind}`}
                data-active={rows[0]?.kind === kind}
                className="hud-icon-button flex h-7 w-9 items-center justify-center"
                onClick={() =>
                  setRows((current) => {
                    const first = current[0];
                    if (!first || !isAid(first.item)) return current;
                    const item = asAnswer(kind, first.item, context);
                    return [{ kind, item, label: termRowLabel(item, '', { lordName: null }) }];
                  })
                }
              >
                <TermIconImg icon={AID_ICONS[kind]} size={20} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      {context?.demandFor && context.ownHouseId && !present.has('oath') && (
        <Tooltip content="Požadovat vazalství">
          <button
            type="button"
            aria-label="Požadovat vazalství"
            data-testid="terms-add-oath"
            className="hud-icon-button flex h-7 w-9 items-center justify-center"
            onClick={() => {
              const item: TermItem = {
                kind: 'oath',
                lord: context.ownHouseId!,
                vassal: context.demandFor!,
              };
              setRows((current) => [
                { kind: 'oath', item, label: 'Požadovaná přísaha vazalství' },
                ...current,
              ]);
            }}
          >
            <HouseIcon name="seal" size={20} />
          </button>
        </Tooltip>
      )}
      <div className="flex items-center gap-1.5">
        {(aidMode || tradeMode || ransomMode ? [] : ADDABLE)
          .filter(
            (a) =>
              !present.has(a.kind) &&
              (a.kind !== 'ransom' || rows.length === 0) &&
              newRow(a.kind, context) !== null,
          )
          .map((a) => (
            <Tooltip key={a.kind} content={a.label}>
              <button
                type="button"
                aria-label={a.label}
                data-testid={`terms-add-${a.kind}`}
                className="hud-icon-button flex h-7 w-9 items-center justify-center"
                onClick={() => {
                  const item = newRow(a.kind, context);
                  if (!item) return;
                  setRows((current) => [
                    ...current,
                    { kind: item.kind, item, label: termRowLabel(item, '', { lordName: null }) },
                  ]);
                }}
              >
                <HouseIcon name={a.icon} size={20} />
              </button>
            </Tooltip>
          ))}
      </div>
      <textarea
        aria-label="Vzkaz"
        data-testid="terms-message"
        value={message}
        rows={2}
        maxLength={NEGOTIATION.messageMaxChars}
        onChange={(event) => setMessage(event.target.value)}
        className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
      />
      <div className="flex items-center gap-1.5">
        <Tooltip content={submitLabel}>
          <button
            type="button"
            aria-label={submitLabel}
            data-testid="terms-submit"
            disabled={
              busy ||
              tooLong ||
              (rows.length === 0 && !allowEmpty) ||
              rows.some((r) => r.item.kind === 'ransom' && r.item.prisonerIds.length === 0)
            }
            className="hud-icon-button flex h-8 w-10 items-center justify-center"
            onClick={() =>
              onSubmit(
                rows.map((r) => r.item),
                message.trim() === '' ? null : message,
              )
            }
          >
            <HouseIcon name={submitIcon} size={22} />
          </button>
        </Tooltip>
        <Tooltip content="Zrušit">
          <button
            type="button"
            aria-label="Zrušit"
            data-testid="terms-cancel"
            className="hud-icon-button flex h-8 w-10 items-center justify-center"
            onClick={onCancel}
          >
            <HouseIcon name="cross" size={18} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
