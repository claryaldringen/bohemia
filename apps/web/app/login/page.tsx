import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { isGoogleEnabled } from '@/lib/auth';
import { getSession } from '@/lib/session';

export default async function LoginPage(): Promise<ReactElement> {
  if (await getSession()) redirect('/game');
  return (
    <AuthCard
      title="Přihlášení"
      footer={
        <>
          <p>
            <Link href="/forgot-password" className="underline">
              Zapomenuté heslo?
            </Link>
          </p>
          <p>
            Nemáš účet?{' '}
            <Link href="/register" className="underline">
              Zaregistruj se
            </Link>
          </p>
        </>
      }
    >
      <LoginForm googleEnabled={isGoogleEnabled} />
    </AuthCard>
  );
}
