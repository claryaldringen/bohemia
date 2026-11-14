import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameMenuPanel, RESTART_WARNING, type GameMenuBusy } from '../GameMenu';
import type { GameMenuStep } from '@/lib/game-menu';

const noop = (): void => {};

/** HTML panelu nabídky – bez DOMu v testech stačí statický render. */
function render(
  step: GameMenuStep,
  options: { canRestart?: boolean; busy?: GameMenuBusy; error?: string | null } = {},
): string {
  return renderToStaticMarkup(
    <GameMenuPanel
      step={step}
      busy={options.busy ?? null}
      error={options.error ?? null}
      canRestart={options.canRestart ?? true}
      email="hrac@example.com"
      onRestart={noop}
      onConfirmRestart={noop}
      onCancelRestart={noop}
      onSignOut={noop}
      onSettings={noop}
      soundOn
      onToggleSound={noop}
      onBackFromSettings={noop}
      onClose={noop}
    />,
  );
}

/** Tlačítka panelu: text a jestli je zamčené. */
function buttons(html: string): { text: string; disabled: boolean }[] {
  return [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => ({
    text: m[2]!,
    disabled: / disabled=""/.test(m[1]!),
  }));
}

describe('GameMenuPanel', () => {
  it('nabídka je dialog Nabídka s položkami Nastavení, Začít znovu, Odhlásit a Zpět do hry', () => {
    const html = render('main');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Nabídka"');
    expect(buttons(html)).toEqual([
      { text: 'Nastavení', disabled: false },
      { text: 'Začít znovu', disabled: false },
      { text: 'Odhlásit', disabled: false },
      { text: 'Zpět do hry', disabled: false },
    ]);
    // kdo je přihlášený, prozradí popisek Odhlásit
    expect(html).toContain('hrac@example.com');
    expect(html).not.toContain(RESTART_WARNING);
  });

  it('bez vsi (zakládání) není co začínat znovu – položka je zamčená', () => {
    expect(buttons(render('main', { canRestart: false }))[1]).toEqual({
      text: 'Začít znovu',
      disabled: true,
    });
  });

  it('potvrzení varuje krátce a nabídne Začít znovu / Zrušit', () => {
    const html = render('confirm');
    expect(html).toContain(RESTART_WARNING);
    expect(RESTART_WARNING).toBe('Ves i rod zaniknou, začneš v\u00a0nové krajině.');
    expect(html).toContain('aria-describedby="game-menu-warning"');
    // varování na jeden řádek – panel se kvůli němu rozšíří (w-max), nezalomí se
    expect(html).toMatch(/<p id="game-menu-warning"[^>]*class="[^"]*whitespace-nowrap/);
    expect(html).toMatch(/data-testid="game-menu"[^>]*class="[^"]*w-max/);
    expect(buttons(html)).toEqual([
      { text: 'Začít znovu', disabled: false },
      { text: 'Zrušit', disabled: false },
    ]);
  });

  it('během restartu na serveru je všechno zamčené, chyba se ukáže v panelu', () => {
    const pending = buttons(render('confirm', { busy: 'restart' }));
    expect(pending.every((b) => b.disabled)).toBe(true);
    const failed = render('confirm', { error: 'Spojení se serverem selhalo.' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Spojení se serverem selhalo.');
    expect(buttons(failed).every((b) => !b.disabled)).toBe(true);
  });
});
