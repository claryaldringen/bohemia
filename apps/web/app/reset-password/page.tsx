import Link from 'next/link';
import type { ReactElement } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Notice } from '@/components/auth/form';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { authErrorMessage } from '@/lib/auth-errors';

interface Props {
  // Better Auth sem přesměruje z odkazu v e-mailu s ?token=…, nebo s ?error=INVALID_TOKEN.
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props): Promise<ReactElement> {
  const { token, error } = await searchParams;
  return (
    <AuthCard title="Nové heslo">
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Notice title={authErrorMessage({ code: error ?? 'INVALID_TOKEN' })}>
          <Link href="/forgot-password" className="underline">
            Poslat nový odkaz
          </Link>
        </Notice>
      )}
    </AuthCard>
  );
}
