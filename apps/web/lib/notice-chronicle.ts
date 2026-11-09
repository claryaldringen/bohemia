// Texty kroniky k trvalým stavům vsi z upozornění (absence.md – Upozornění vsi do kroniky):
// začátek a konec stavu – krátká věta jako ostatní zápisy kroniky; začátek odpovídá řádku
// upozornění nahoře (village-notices.ts).

import type { LastingNotice } from '@bohemia/game';

interface NoticeChronicleText {
  began: string;
  ended: string;
}

export const NOTICE_CHRONICLE_TEXTS: Record<LastingNotice, NoticeChronicleText> = {
  rationing: {
    began: 'Ves šetří jídlem – zásoby nevystačí do sklizně.',
    ended: 'Ves už nešetří jídlem.',
  },
  'seed-rationing': { began: 'Ves šetří na osivo.', ended: 'Ves už nešetří na osivo.' },
  hungry: { began: 'Ves hladoví.', ended: 'Hlad skončil.' },
  starving: { began: 'Lidé umírají hlady.', ended: 'Lidé už neumírají hlady.' },
  stalled: { began: 'Stavby stojí.', ended: 'Na stavbách se zase pracuje.' },
  'no-charcoal': { began: 'Kovář nemá uhlí.', ended: 'Kovář má zase uhlí.' },
  'no-ore': { began: 'Kovář nemá rudu.', ended: 'Kovář má zase rudu.' },
  'no-clay': { began: 'Hrnčíř nemá hlínu.', ended: 'Hrnčíř má zase hlínu.' },
  'no-wood': { began: 'Dílna nemá co kácet.', ended: 'Dílna má zase co kácet.' },
  'carpenter-no-wood': { began: 'Tesař nemá klády.', ended: 'Tesař má zase klády.' },
  'pen-short': {
    began: 'Stáda se nevejdou do ohrad.',
    ended: 'Stáda se zase vejdou do ohrad.',
  },
  'oxen-short': {
    began: 'Voli se nevejdou do ohrady.',
    ended: 'Voli se zase vejdou do ohrady.',
  },
  'horses-short': {
    began: 'Koně se nevejdou do ohrady.',
    ended: 'Koně se zase vejdou do ohrady.',
  },
  'horses-ungrained': { began: 'Koně jsou bez obilí.', ended: 'Koně mají zase obilí.' },
  'dogs-ungrained': { began: 'Psi jsou bez obilí.', ended: 'Psi mají zase obilí.' },
  'emergency-threshing': {
    began: 'Ves nemá humno – mlátí se na udusané zemi.',
    ended: 'Výmlat na udusané zemi skončil.',
  },
  'threshing-floor-short': {
    began: 'Humno nestačí – část se mlátí nouzově.',
    ended: 'Humno zase stačí.',
  },
};

/** Zápis kroniky o začátku (`ended` false) nebo konci trvalého stavu vsi. */
export function noticeChronicleText(notice: LastingNotice, ended: boolean): string {
  const text = NOTICE_CHRONICLE_TEXTS[notice];
  return ended ? text.ended : text.began;
}
