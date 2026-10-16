import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, children, footer }: Props): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center font-serif text-3xl font-semibold">
          Bohemia
        </Link>
        <section className="rounded-lg border border-stone-300 bg-white/60 p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
          <h1 className="mb-5 font-serif text-2xl">{title}</h1>
          {children}
        </section>
        {footer && (
          <div className="mt-4 space-y-1 text-center text-sm text-stone-600 dark:text-stone-400">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
