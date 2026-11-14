'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/panels (v produkci stránka vrací 404): panel výběru s ukázkovými
// daty (dev-panels.ts) mezi minimapou a mřížkou staveb, bez přihlášení, databáze a scény – pro
// kontrolu rozvržení panelu na různě velkém okně. Akce panelu nic nedělají. V liště i seznam vsí
// s dlouhými jmény a nabídka hry (i potvrzení Začít znovu).
import { useState, type ReactElement } from 'react';
import { BuildGrid } from '@/components/game/hud/BuildGrid';
import { GameMenuPanel } from '@/components/game/hud/GameMenu';
import { SelectionPanel } from '@/components/game/hud/SelectionPanel';
import { VillageList } from '@/components/game/hud/VillageSwitcher';
import type { GameMenuStep } from '@/lib/game-menu';
import { BUILD_ITEMS, type BuildItem } from '@/lib/build-items';
import { PanelOptionsContext } from '@/hooks/use-panel-options';
import { DEV_PANELS, DEV_PANEL_OPTIONS, DEV_VILLAGES } from './dev-panels';

/** Stavby v mřížce bez ceny – mřížka má jen ukázat, kolik místa zabírá. */
const BUILD_OPTIONS: Partial<Record<BuildItem['kind'], null>> = Object.fromEntries(
  BUILD_ITEMS.map((item) => [item.kind, null]),
);

/** Akce panelu – chvíli „běží“ a nic neudělají. */
const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));

/** Výprava – server ji odmítne (ukázka chyby v panelu obchodu, trade.md – Rozhraní). */
const refuse = (): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve('Tolik lidí soused letos nemá.'), 300));

/** Příkaz varování – nic neudělá a ikona zašedne s důvodem (ukázka po odeslání). */
const alarmRefuse = (): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve('Ukázka – nic se nestalo.'), 300));

export function DevPanelsView({ initial }: { initial: string | null }): ReactElement {
  const [menu, setMenu] = useState<GameMenuStep | null>(null);
  const [villages, setVillages] = useState(false);
  // rozcestník mřížky staveb (ohrada – druhy zvířat) jde otevřít i tady
  const [buildGroup, setBuildGroup] = useState<BuildItem['kind'] | null>(null);
  const [key, setKey] = useState(
    DEV_PANELS.some((p) => p.key === initial) ? initial! : DEV_PANELS[0]!.key,
  );
  const index = DEV_PANELS.findIndex((p) => p.key === key);
  const sample = DEV_PANELS[index] ?? DEV_PANELS[0]!;
  const go = (step: number): void => {
    const next = DEV_PANELS[(index + step + DEV_PANELS.length) % DEV_PANELS.length]!;
    setKey(next.key);
    window.history.replaceState(null, '', `?panel=${next.key}`);
  };
  return (
    <PanelOptionsContext.Provider value={DEV_PANEL_OPTIONS}>
      <div className="fixed inset-0 bg-[linear-gradient(180deg,#a1bfd9_0%,#c9d8c0_35%,#7d9a5a_36%,#5f7d43_100%)]" />
      <header className="hud-panel fixed inset-x-0 top-0 z-20 flex h-11 items-center gap-2 rounded-none border-x-0 border-t-0 px-2 text-sm">
        <button type="button" className="hud-button px-2" onClick={() => go(-1)}>
          ←
        </button>
        <select
          data-testid="dev-panel-select"
          value={sample.key}
          onChange={(e) => {
            setKey(e.target.value);
            window.history.replaceState(null, '', `?panel=${e.target.value}`);
          }}
          className="rounded bg-[#15100b] px-2 py-0.5 text-[#ecdfc4]"
        >
          {DEV_PANELS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="button" className="hud-button px-2" onClick={() => go(1)}>
          →
        </button>
        <span className="relative ml-4">
          <button
            type="button"
            data-testid="dev-villages"
            className="hud-button px-2"
            onClick={() => setVillages((v) => !v)}
          >
            Vsi
          </button>
          {villages && (
            <VillageList
              villages={DEV_VILLAGES}
              currentId={DEV_VILLAGES[0]!.id}
              onSelect={() => setVillages(false)}
            />
          )}
        </span>
        <button
          type="button"
          data-testid="dev-menu"
          className="hud-button ml-auto px-2"
          onClick={() => setMenu((m) => (m === null ? 'main' : m === 'main' ? 'confirm' : null))}
        >
          Nabídka
        </button>
      </header>
      {menu && (
        <GameMenuPanel
          step={menu}
          busy={null}
          error={null}
          canRestart
          email="vyvojar@bohemia.test"
          onRestart={() => setMenu('confirm')}
          onConfirmRestart={() => setMenu(null)}
          onCancelRestart={() => setMenu('main')}
          onSignOut={() => setMenu(null)}
          onSettings={() => setMenu('settings')}
          soundOn
          onToggleSound={() => {}}
          onBackFromSettings={() => setMenu('main')}
          onClose={() => setMenu(null)}
        />
      )}
      {/* Místo minimapy – stejný rozměr jako Minimap (196 px + okraj). */}
      <div data-hud-block className="hud-panel fixed bottom-2 left-2 z-20 p-1.5">
        <div className="hud-inset h-[196px] w-[196px]" />
      </div>
      <SelectionPanel
        key={sample.key}
        details={sample.details}
        onSelectTarget={() => undefined}
        onCancelConstruction={wait}
        onLeave={() => undefined}
        onUpgradeRoad={wait}
        onPlantRoadApples={wait}
        onBuildTrail={wait}
        onSendExpedition={refuse}
        alarm={
          sample.alarm
            ? { view: sample.alarm, onCommand: alarmRefuse, onReturn: alarmRefuse }
            : undefined
        }
      />
      <BuildGrid
        options={BUILD_OPTIONS}
        active={null}
        disabled={false}
        group={buildGroup}
        onBuild={(kind, variant) => {
          const item = BUILD_ITEMS.find((i) => i.kind === kind);
          const hub = item?.placement === 'squares' && item.variants !== undefined;
          setBuildGroup(hub && variant === undefined && buildGroup !== kind ? kind : null);
        }}
      />
    </PanelOptionsContext.Provider>
  );
}
