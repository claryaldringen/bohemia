import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';

export function Field({
  label,
  ...input
}: { label: string } & InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-stone-700 dark:text-stone-300">{label}</span>
      <input
        className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        {...input}
      />
    </label>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-stone-900 px-4 py-2 text-stone-50 hover:bg-stone-700 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
    >
      {children}
    </button>
  );
}

export function FormError({ message }: { message?: string }): ReactElement | null {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}

export function Notice({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div role="status" className="space-y-2">
      <p className="font-semibold">{title}</p>
      <div className="text-sm text-stone-700 dark:text-stone-300">{children}</div>
    </div>
  );
}
