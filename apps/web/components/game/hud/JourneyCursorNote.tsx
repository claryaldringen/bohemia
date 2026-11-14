import type { ReactElement } from 'react';

/** Popisek u kurzoru při ovládání vojvody: „Na sousední mapu“ u okraje, nebo důvod odmítnutí. */
export function JourneyCursorNote({
  note,
}: {
  note: { text: string; tone: 'info' | 'error'; screen: { x: number; y: number } } | null;
}): ReactElement | null {
  if (!note) return null;
  const flipX = note.screen.x > window.innerWidth - 220;
  return (
    <div
      role="status"
      data-testid="journey-cursor-note"
      data-tone={note.tone}
      className={`pointer-events-none fixed z-30 rounded-sm bg-black/55 px-1.5 py-0.5 font-serif text-sm [text-shadow:0_1px_1px_rgb(0_0_0/0.9)] ${note.tone === 'error' ? 'text-[#ff9c88]' : 'text-[#f3dfb0]'}`}
      style={{
        top: note.screen.y + 18,
        left: flipX ? undefined : note.screen.x + 18,
        right: flipX ? window.innerWidth - note.screen.x + 18 : undefined,
      }}
    >
      {note.text}
    </div>
  );
}
