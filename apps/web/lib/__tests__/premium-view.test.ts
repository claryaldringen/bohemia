import { describe, expect, it } from 'vitest';
import { PREMIUM_TYPES } from '@bohemia/game';
import {
  PREMIUM_TEXTS,
  premiumIcon,
  premiumIntroNotice,
  premiumIntroText,
  premiumLaterTip,
  premiumNowTip,
} from '../premium-view';

// Co hráč vidí z prémiové krajiny (premium-landscapes.md – Co hráč vidí).

describe('představení prémiové krajiny', () => {
  it('jedna věta s ikonou typu jen u sídla s typem, dokud ves není založená', () => {
    expect(premiumIntroNotice('iron-ore', false)).toEqual({
      kind: 'premium-intro',
      tone: 'info',
      text: 'Krajina rodu: Bohatá železná ruda – kovář potřebuje méně rudy – levnější nástroje.',
      icon: '/icons/premium/iron-ore.png',
    });
    expect(premiumIntroNotice(undefined, false)).toBeNull();
    expect(premiumIntroNotice('iron-ore', true)).toBeNull();
  });

  it('typ bez účinku hned řekne, co přijde později', () => {
    expect(premiumIntroText('salt-spring')).toBe(
      'Krajina rodu: Solný pramen – později solivar – velmi cenné zboží.',
    );
  });

  it('každý typ má ikonu, krátký název a aspoň „hned“ nebo „později“', () => {
    for (const type of PREMIUM_TYPES) {
      const texts = PREMIUM_TEXTS[type];
      expect(texts.short.length).toBeLessThanOrEqual(18);
      expect(texts.now ?? texts.later).not.toBeNull();
      expect(premiumIcon(type)).toBe(`/icons/premium/${type}.png`);
      expect(premiumIntroText(type)).toMatch(/^Krajina rodu: .+\.$/);
      expect(premiumIntroText(type)).not.toContain('—');
    }
    expect(premiumNowTip('deep-gold')).toBe('Hned: zatím nic');
    expect(premiumLaterTip('fertile')).toBe('Později: nic dalšího');
  });
});
