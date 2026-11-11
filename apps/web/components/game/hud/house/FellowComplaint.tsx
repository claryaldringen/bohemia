'use client';

import { useState, type ReactElement } from 'react';
import { NEGOTIATION } from '@bohemia/game';
import type { FellowView } from '@/lib/house-view';
import { HouseLink, PlayerAction } from './parts';

/** Spoluvazal: portrét a tlačítko Žaloba, které otevře vzkaz pánovi. */
export function FellowComplaint({
  fellow,
  busy,
  onFile,
}: {
  fellow: FellowView;
  busy: boolean;
  onFile: (message: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <div data-testid="house-fellow" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <HouseLink house={fellow.house} testId="house-fellow-link" />
        <PlayerAction
          label="Žaloba"
          icon="scales"
          testId={`fellow-complain-${fellow.house.houseId}`}
          reason={null}
          busy={busy}
          onClick={() => setOpen(!open)}
        />
      </div>
      {open && (
        <div data-testid="complaint-form" className="flex flex-col gap-1.5">
          <textarea
            aria-label="Žaloba"
            data-testid="complaint-text"
            value={text}
            rows={2}
            maxLength={NEGOTIATION.messageMaxChars}
            onChange={(event) => setText(event.target.value)}
            className="w-full resize-none rounded-sm border border-[#5c4526] bg-[#15100b] p-1 text-xs"
          />
          <PlayerAction
            label="Podat žalobu"
            icon="seal-pen"
            testId="complaint-submit"
            reason={text.trim() === '' ? 'Napiš pánovi, o co jde.' : null}
            busy={busy}
            onClick={() => {
              setOpen(false);
              onFile(text);
              setText('');
            }}
          />
        </div>
      )}
    </div>
  );
}
