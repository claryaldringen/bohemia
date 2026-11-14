import { describe, expect, it } from 'vitest';
import { MENU_HOTKEY, menuKeyAction, nextFocusIndex, opensMenu } from '../game-menu';

const key = (
  name: string,
  extra: Partial<Parameters<typeof opensMenu>[0]> = {},
): Parameters<typeof opensMenu>[0] => ({
  key: name,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe('nabídka hry – klávesy', () => {
  it('F10 nabídku otevře jako v 0 A.D. – bez modifikátorů a ne opakováním při držení', () => {
    expect(MENU_HOTKEY).toBe('F10');
    expect(opensMenu(key('F10'))).toBe(true);
    expect(opensMenu(key('F10', { repeat: true }))).toBe(false);
    expect(opensMenu(key('F10', { ctrlKey: true }))).toBe(false);
    expect(opensMenu(key('F10', { metaKey: true }))).toBe(false);
    expect(opensMenu(key('F10', { altKey: true }))).toBe(false);
    expect(opensMenu(key('Escape'))).toBe(false);
    expect(opensMenu(key('F1'))).toBe(false);
  });

  it('F10 i Esc otevřenou nabídku zavřou, Esc z potvrzení jen vrátí k položkám', () => {
    expect(menuKeyAction('F10', 'main', false)).toBe('close');
    expect(menuKeyAction('F10', 'confirm', false)).toBe('close');
    expect(menuKeyAction('Escape', 'main', false)).toBe('close');
    expect(menuKeyAction('Escape', 'confirm', false)).toBe('back');
    expect(menuKeyAction('Escape', 'settings', false)).toBe('back');
    // ostatní klávesy nabídka nechá být (Enter / mezerník stisknou tlačítko s fokusem)
    expect(menuKeyAction('Enter', 'main', false)).toBeNull();
    expect(menuKeyAction('z', 'main', false)).toBeNull();
  });

  it('když restart nebo odhlášení běží na serveru, nabídka zůstane, jak je', () => {
    expect(menuKeyAction('F10', 'confirm', true)).toBeNull();
    expect(menuKeyAction('Escape', 'confirm', true)).toBeNull();
    expect(menuKeyAction('Escape', 'main', true)).toBeNull();
  });

  it('Tab nepustí fokus z nabídky – dokola po tlačítkách, Shift + Tab pozpátku', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(1, 3, true)).toBe(0);
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});
