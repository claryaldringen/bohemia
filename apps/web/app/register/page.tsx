import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getSession } from '@/lib/session';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ pozvanka?: string | string[] }>;
}): Promise<ReactElement> {
  if (await getSession()) redirect('/game');
  const { pozvanka } = await searchParams;
  const invite = typeof pozvanka === 'string' ? pozvanka.slice(0, 16) : '';
  return (
    <AuthCard
      title="Registrace"
      footer={
        <p>
          Už máš účet?{' '}
          <Link href="/login" className="underline">
            Přihlas se
          </Link>
        </p>
      }
    >
      <RegisterForm initialInvite={invite} />
    </AuthCard>
  );
}
